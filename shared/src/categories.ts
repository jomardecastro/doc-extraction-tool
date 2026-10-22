/**
 * The six extraction categories required by the assessment's `ExtractedReport` shape.
 * The order is the display order in the dashboard tabs and the export files.
 */
export const CATEGORIES = [
  "goals",
  "bmps",
  "implementation",
  "monitoring",
  "outreach",
  "geographic",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  goals: "Goals",
  bmps: "BMPs",
  implementation: "Implementation",
  monitoring: "Monitoring",
  outreach: "Outreach",
  geographic: "Geographic areas",
};
