import { describe, expect, it } from "vitest";
import type { ExtractedDocument } from "../src/pdf/types.js";
import { pageTexts, verifyItems } from "../src/postprocess/verify.js";

function doc(pages: string[][]): ExtractedDocument {
  return {
    pages: pages.map((texts, i) => ({
      pageNumber: i + 1,
      role: "main",
      chars: texts.join(" ").length,
      blocks: texts.map((text) => ({ type: "paragraph", text, level: 0, fontSize: 12, bold: false, x0: 0, yTop: 0, yBottom: 0, lineCount: 1 })),
    })),
    sections: [],
    stats: { pageCount: pages.length, textChars: 0, bodyFontSize: 12, headings: 0, bullets: 0, tables: 0, administrativePages: 0, supportingPages: 0, droppedHeaderFooterLines: 0, droppedBlocks: 0 },
  };
}

const pages = pageTexts(
  doc([
    ["Steele Bayou drains approximately 202,617 acres of the Yazoo River basin."],
    ["Water Control Structures $1,500 25 $37,500", "Large Overfall Pipes $101,721 36 $3,661,956"],
    ["The Dissolved Oxygen criterion is a 5.0 mg/L daily average – 4.0 mg/L instantaneous."],
  ]),
);

const base = { confidence: "high" as const };

describe("verifyItems", () => {
  it("keeps an item whose quote is on the claimed page", () => {
    const { items, stats } = verifyItems([{ ...base, name: "Steele Bayou Watershed", page: 1, sourceQuote: "drains approximately 202,617 acres", areaValue: 202617 }], pages, ["areaValue"]);
    expect(items).toHaveLength(1);
    expect(items[0]!.verified).toBe(true);
    expect(items[0]!.areaValue).toBe(202617);
    expect(stats).toMatchObject({ kept: 1, dropped: 0, numbersNulled: 0 });
  });

  it("corrects the page when the quote is elsewhere", () => {
    const { items, stats } = verifyItems([{ ...base, name: "Large Overfall Pipes", page: 1, sourceQuote: "Large Overfall Pipes $101,721 36 $3,661,956", quantity: 36 }], pages, ["quantity"]);
    expect(items[0]!.page).toBe(2);
    expect(stats.pageCorrected).toBe(1);
  });

  it("forgives table separators, curly quotes and dashes", () => {
    const { items } = verifyItems(
      [
        { ...base, name: "Water Control Structures", page: 2, sourceQuote: "Water Control Structures | | $1,500 | 25 | $37,500" },
        { ...base, name: "Dissolved Oxygen", page: 3, sourceQuote: "5.0 mg/L daily average - 4.0 mg/L instantaneous" },
      ],
      pages,
      [],
    );
    expect(items).toHaveLength(2);
  });

  it("drops an item whose quote is not in the document", () => {
    const { items, stats } = verifyItems([{ ...base, name: "Cover crops", page: 2, sourceQuote: "Cover crops on 500 acres of cropland" }], pages, []);
    expect(items).toHaveLength(0);
    expect(stats.dropped).toBe(1);
  });

  it("nulls a number that is not written in the source", () => {
    const { items, stats } = verifyItems([{ ...base, name: "Water Control Structures", page: 2, sourceQuote: "Water Control Structures $1,500 25 $37,500", quantity: 30 }], pages, ["quantity"]);
    expect(items[0]!.quantity).toBeNull();
    expect(stats.numbersNulled).toBe(1);
  });

  it("checks nested numeric fields", () => {
    const { items } = verifyItems(
      [{ ...base, name: "Water Control Structures", page: 2, sourceQuote: "Water Control Structures $1,500 25 $37,500", expectedLoadReduction: { value: 99, unit: "tons", pollutant: "sediment" } }],
      pages,
      ["expectedLoadReduction.value"],
    );
    expect(items[0]!.expectedLoadReduction.value).toBeNull();
  });

  it("downgrades confidence when the name is not on the page", () => {
    const { items, stats } = verifyItems([{ ...base, name: "Riparian buffers and fencing", page: 2, sourceQuote: "Water Control Structures $1,500 25 $37,500" }], pages, []);
    expect(items[0]!.confidence).toBe("low");
    expect(stats.downgraded).toBe(1);
  });
});
