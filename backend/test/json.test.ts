import { describe, expect, it } from "vitest";
import { z } from "zod";
import { LlmBmpSchema } from "@det/shared";
import { extractJsonObject, normalizeForSchema, schemaForPrompt } from "../src/llm/json.js";

describe("extractJsonObject", () => {
  it("finds the object inside prose and code fences", () => {
    expect(extractJsonObject('Here you go:\n```json\n{"items": [1, 2]}\n```\nDone.')).toEqual({ items: [1, 2] });
  });
  it("ignores braces inside strings", () => {
    expect(extractJsonObject('{"a": "x } y", "b": {"c": 1}}')).toEqual({ a: "x } y", b: { c: 1 } });
  });
  it("returns null for unbalanced or absent JSON", () => {
    expect(extractJsonObject('{"a": 1')).toBeNull();
    expect(extractJsonObject("no json here")).toBeNull();
  });
});

describe("normalizeForSchema", () => {
  it("coerces enum spelling, numeric strings and missing fields toward the schema", () => {
    const raw = {
      name: "Cover Crop",
      description: "x",
      category: "Agricultural",
      quantity: "17,727",
      unit: "ac",
      estimatedCost: "$1,294,071",
      targetPollutants: "sediment",
      expectedLoadReduction: null,
      status: "Planned",
      location: "",
      page: "7",
      sourceQuote: "Cover Crop (ac) | 17,727 @ $73 | $1,294,071",
      confidence: "HIGH",
    };
    const out = LlmBmpSchema.parse(normalizeForSchema(raw, LlmBmpSchema));
    expect(out.category).toBe("agricultural");
    expect(out.quantity).toBe(17727);
    expect(out.estimatedCost).toBe(1294071);
    expect(out.targetPollutants).toEqual(["sediment"]);
    expect(out.status).toBe("planned");
    expect(out.location).toBeNull();
    expect(out.sectionTitle).toBeNull();
    expect(out.page).toBe(7);
    expect(out.confidence).toBe("high");
  });

  it("falls back to the neutral enum member for unknown values", () => {
    const schema = z.object({ status: z.enum(["planned", "completed", "unknown"]), kind: z.enum(["goal", "objective"]) });
    expect(normalizeForSchema({ status: "maybe", kind: "aspiration" }, schema)).toEqual({ status: "unknown", kind: "goal" });
  });
});

describe("schemaForPrompt", () => {
  it("renders a compact JSON schema with descriptions", () => {
    const text = schemaForPrompt(LlmBmpSchema);
    expect(text).toContain('"estimatedCost"');
    expect(text).toContain("Dollars, digits only");
    expect(text.length).toBeLessThan(4000);
  });
});
