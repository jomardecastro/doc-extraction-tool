import { describe, expect, it } from "vitest";
import type { BMP, ImplementationActivity } from "@det/shared";
import { buildSummary } from "../src/postprocess/summary.js";

const bmp = (status: BMP["status"], category: BMP["category"] = "structural"): BMP => ({
  id: "x",
  name: "x",
  description: "",
  category,
  quantity: null,
  unit: null,
  estimatedCost: null,
  targetPollutants: [],
  expectedLoadReduction: null,
  status,
  location: null,
  page: 1,
  sourceQuote: "",
  sectionTitle: null,
  confidence: "high",
  verified: true,
});
const activity = (status: ImplementationActivity["status"]): ImplementationActivity => ({
  id: "y",
  name: "y",
  description: "",
  responsibleParty: null,
  timeframe: null,
  isMilestone: false,
  status,
  relatedBmp: null,
  cost: null,
  page: 1,
  sourceQuote: "",
  sectionTitle: null,
  confidence: "high",
  verified: true,
});

const empty = { goals: [], monitoring: [], outreach: [], geographicAreas: [] };

describe("buildSummary", () => {
  it("computes the completion rate from items that have a status", () => {
    const s = buildSummary(
      {
        ...empty,
        bmps: [bmp("completed"), bmp("planned", "agricultural"), bmp("unknown")],
        implementation: [activity("completed")],
      },
      2,
    );
    expect(s.totalBMPs).toBe(3);
    expect(s.completionRate).toBeCloseTo(2 / 3);
    expect(s.completionRateBasis).toBe("status");
    expect(s.byBmpCategory).toEqual({ structural: 2, agricultural: 1 });
    expect(s.droppedUnverified).toBe(2);
    expect(s.verifiedRate).toBeCloseTo(4 / 6);
  });

  it("reports no basis when nothing carries a status", () => {
    const s = buildSummary({ ...empty, bmps: [bmp("unknown")], implementation: [] }, 0);
    expect(s.completionRate).toBe(0);
    expect(s.completionRateBasis).toBe("none");
    expect(s.verifiedRate).toBe(1);
  });
});
