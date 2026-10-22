import { describe, expect, it } from "vitest";
import { dedupeItems } from "../src/postprocess/dedupe.js";

describe("dedupeItems", () => {
  it("merges items with the same name key, keeping the higher confidence and filling gaps", () => {
    const { items, merged } = dedupeItems([
      {
        name: "Water control structures",
        confidence: "medium" as const,
        quantity: null,
        estimatedCost: 37500,
        targetPollutants: ["sediment"],
      },
      {
        name: "Water Control Structure",
        confidence: "high" as const,
        quantity: 25,
        estimatedCost: null,
        targetPollutants: ["turbidity"],
      },
      {
        name: "Cover crops",
        confidence: "high" as const,
        quantity: 100,
        estimatedCost: null,
        targetPollutants: [],
      },
    ]);
    expect(merged).toBe(1);
    expect(items).toHaveLength(2);
    const wcs = items.find((i) => i.name === "Water Control Structure")!;
    expect(wcs.confidence).toBe("high");
    expect(wcs.quantity).toBe(25);
    expect(wcs.estimatedCost).toBe(37500);
    expect(wcs.targetPollutants.sort()).toEqual(["sediment", "turbidity"]);
  });

  it("leaves distinct items alone", () => {
    const { items, merged } = dedupeItems([
      { name: "Teacher workshops", confidence: "high" as const },
      { name: "Adopt A Stream", confidence: "high" as const },
    ]);
    expect(merged).toBe(0);
    expect(items).toHaveLength(2);
  });
});
