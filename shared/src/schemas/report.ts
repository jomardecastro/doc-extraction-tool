import { z } from "zod";
import { CATEGORIES } from "../categories.js";

/**
 * The extraction data model.
 *
 * Two layers of schema per item type:
 *  - `Llm*`: what the model is asked to produce. Every field is required (nullable rather than
 *    optional) and enums are closed, so a model that forgets a field fails validation instead of
 *    silently dropping provenance. The JSON schema of each is embedded in the prompt.
 *  - the public item (`Goal`, `BMP`, ...): the `Llm*` shape plus `id` and `verified`, which the
 *    server computes after checking the quote against the PDF text.
 *
 * The assessment's required top-level shape (`summary`, `goals`, `bmps`, `implementation`,
 * `monitoring`, `outreach`, `geographicAreas`) is preserved exactly; `document` and `run` are
 * additive.
 */

export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const StatusSchema = z.enum(["planned", "in_progress", "completed", "unknown"]);
export type Status = z.infer<typeof StatusSchema>;

/** Where an item came from. `sourceQuote` must be copied verbatim from one page of the PDF. */
const provenanceFields = {
  page: z.number().int().describe("The n attribute of the <page> element containing the quote"),
  sourceQuote: z
    .string()
    .describe("Exact verbatim copy of contiguous text from that page, under 300 characters"),
  sectionTitle: z.string().nullable().describe("The heading the quote sits under, or null"),
  confidence: ConfidenceSchema,
};

const serverFields = {
  id: z.string(),
  /** True when `sourceQuote` was found verbatim in the extracted PDF text. */
  verified: z.boolean(),
};

// ---- Goals ----------------------------------------------------------------------------------

export const LlmGoalSchema = z.object({
  name: z.string().describe("Short label in the document's own words, under 80 characters"),
  description: z.string().describe("One or two sentences in your own words"),
  kind: z.enum(["goal", "objective"]),
  pollutants: z
    .array(z.string())
    .describe("Pollutants named in the goal, e.g. sediment, nutrients, fecal coliform"),
  targetValue: z.number().nullable().describe("A single number stated for the target, else null"),
  targetUnit: z.string().nullable().describe("Unit of targetValue as written, e.g. %, mg/L"),
  targetText: z
    .string()
    .nullable()
    .describe("The target as written when it is a range or qualitative"),
  timeframe: z.string().nullable(),
  ...provenanceFields,
});
export const GoalSchema = LlmGoalSchema.extend(serverFields);
export type LlmGoal = z.infer<typeof LlmGoalSchema>;
export type Goal = z.infer<typeof GoalSchema>;

// ---- BMPs -----------------------------------------------------------------------------------

export const BmpCategorySchema = z.enum([
  "agricultural",
  "structural",
  "streambank_riparian",
  "urban_stormwater",
  "forestry",
  "wastewater_septic",
  "education",
  "other",
]);
export type BmpCategory = z.infer<typeof BmpCategorySchema>;

export const LoadReductionSchema = z.object({
  value: z.number(),
  unit: z.string(),
  pollutant: z.string(),
});

export const LlmBmpSchema = z.object({
  name: z.string().describe("The practice, e.g. Grade Stabilization Structure"),
  description: z.string(),
  category: BmpCategorySchema,
  quantity: z.number().nullable().describe("Planned or installed amount stated in the source"),
  unit: z.string().nullable().describe("Unit of quantity as written, e.g. #, acres, feet"),
  estimatedCost: z.number().nullable().describe("Dollars, digits only"),
  targetPollutants: z.array(z.string()),
  expectedLoadReduction: LoadReductionSchema.nullable().describe(
    "Only when the document gives a number for this practice",
  ),
  status: StatusSchema,
  location: z.string().nullable().describe("Priority area, sub-watershed or site when named"),
  ...provenanceFields,
});
export const BmpSchema = LlmBmpSchema.extend(serverFields);
export type LlmBmp = z.infer<typeof LlmBmpSchema>;
export type BMP = z.infer<typeof BmpSchema>;

// ---- Implementation activities --------------------------------------------------------------

export const LlmImplementationActivitySchema = z.object({
  name: z.string(),
  description: z.string(),
  responsibleParty: z.string().nullable(),
  timeframe: z.string().nullable().describe('As written, e.g. "Months 1-6", "Year 2"'),
  isMilestone: z.boolean().describe("True for milestone/outcome rows and dated deliverables"),
  status: StatusSchema,
  relatedBmp: z.string().nullable(),
  cost: z.number().nullable().describe("Dollars, digits only"),
  ...provenanceFields,
});
export const ImplementationActivitySchema = LlmImplementationActivitySchema.extend(serverFields);
export type LlmImplementationActivity = z.infer<typeof LlmImplementationActivitySchema>;
export type ImplementationActivity = z.infer<typeof ImplementationActivitySchema>;

// ---- Monitoring metrics ---------------------------------------------------------------------

export const MetricTypeSchema = z.enum([
  "water_quality",
  "biological",
  "implementation",
  "social",
  "other",
]);
export const ValueKindSchema = z.enum([
  "target",
  "baseline",
  "achieved",
  "threshold",
  "unspecified",
]);
export const ComparatorSchema = z.enum(["<", "<=", "=", ">=", ">"]);

export const LlmMonitoringMetricSchema = z.object({
  name: z.string(),
  description: z.string(),
  metricType: MetricTypeSchema,
  parameter: z
    .string()
    .describe("The measured parameter, e.g. Dissolved Oxygen, Total Suspended Solids"),
  value: z.number().nullable(),
  unit: z.string().nullable(),
  valueKind: ValueKindSchema,
  comparator: ComparatorSchema.nullable().describe("For thresholds and targets"),
  location: z.string().nullable(),
  frequency: z.string().nullable(),
  responsibleParty: z.string().nullable(),
  ...provenanceFields,
});
export const MonitoringMetricSchema = LlmMonitoringMetricSchema.extend(serverFields);
export type LlmMonitoringMetric = z.infer<typeof LlmMonitoringMetricSchema>;
export type MonitoringMetric = z.infer<typeof MonitoringMetricSchema>;

// ---- Outreach activities --------------------------------------------------------------------

export const OutreachTypeSchema = z.enum([
  "workshop",
  "field_day",
  "publication",
  "signage",
  "school_program",
  "meeting",
  "media",
  "demonstration",
  "other",
]);

export const LlmOutreachActivitySchema = z.object({
  name: z.string(),
  description: z.string(),
  activityType: OutreachTypeSchema,
  audience: z.string().nullable(),
  count: z.number().nullable().describe("Number of events, materials or people when stated"),
  timeframe: z.string().nullable(),
  responsibleParty: z.string().nullable(),
  ...provenanceFields,
});
export const OutreachActivitySchema = LlmOutreachActivitySchema.extend(serverFields);
export type LlmOutreachActivity = z.infer<typeof LlmOutreachActivitySchema>;
export type OutreachActivity = z.infer<typeof OutreachActivitySchema>;

// ---- Geographic areas -----------------------------------------------------------------------

export const AreaTypeSchema = z.enum([
  "watershed",
  "subwatershed",
  "huc",
  "stream",
  "river",
  "lake",
  "county",
  "city",
  "basin",
  "other",
]);

export const LlmGeographicAreaSchema = z.object({
  name: z.string(),
  description: z.string(),
  areaType: AreaTypeSchema,
  hucCode: z.string().nullable().describe("Digits only, as written"),
  areaValue: z.number().nullable(),
  areaUnit: z.string().nullable().describe("acres, square miles, miles"),
  isPrimary: z.boolean().describe("True for the watershed the plan is about"),
  ...provenanceFields,
});
export const GeographicAreaSchema = LlmGeographicAreaSchema.extend(serverFields);
export type LlmGeographicArea = z.infer<typeof LlmGeographicAreaSchema>;
export type GeographicArea = z.infer<typeof GeographicAreaSchema>;

/** The model-facing item schema per category. */
export const LLM_ITEM_SCHEMAS = {
  goals: LlmGoalSchema,
  bmps: LlmBmpSchema,
  implementation: LlmImplementationActivitySchema,
  monitoring: LlmMonitoringMetricSchema,
  outreach: LlmOutreachActivitySchema,
  geographic: LlmGeographicAreaSchema,
} as const;

// ---- Document metadata (one small model call) -----------------------------------------------

export const PlanFamilySchema = z.enum(["watershed_plan", "nine_element", "other"]);
export type PlanFamily = z.infer<typeof PlanFamilySchema>;

export const LlmDocumentMetaSchema = z.object({
  title: z.string(),
  planYear: z.number().int().nullable(),
  planFamily: PlanFamilySchema,
  watershedName: z.string().nullable(),
  hucCodes: z.array(z.string()),
  organizations: z.array(z.string()),
});
export type LlmDocumentMeta = z.infer<typeof LlmDocumentMetaSchema>;

export const DocumentMetaSchema = LlmDocumentMetaSchema.extend({
  pages: z.number().int(),
  /** Pages the model never saw (cover, contents, references...). */
  administrativePages: z.number().int(),
});
export type DocumentMeta = z.infer<typeof DocumentMetaSchema>;

// ---- Report ---------------------------------------------------------------------------------

export const CategorySchema = z.enum(CATEGORIES);

export const ReportSummarySchema = z.object({
  totalGoals: z.number().int(),
  totalBMPs: z.number().int(),
  /** completed / (completed + in_progress + planned) over BMPs and implementation activities, 0..1 */
  completionRate: z.number(),
  completionRateBasis: z.enum(["status", "none"]),
  totalImplementation: z.number().int(),
  totalMonitoring: z.number().int(),
  totalOutreach: z.number().int(),
  totalGeographicAreas: z.number().int(),
  /** Share of returned items whose quote was found verbatim, 0..1. */
  verifiedRate: z.number(),
  /** Items the model returned that were removed because their quote was not in the document. */
  droppedUnverified: z.number().int(),
  byBmpCategory: z.record(z.string(), z.number().int()),
  byStatus: z.record(z.string(), z.number().int()),
});
export type ReportSummary = z.infer<typeof ReportSummarySchema>;

export const RunInfoSchema = z.object({
  provider: z.string(),
  model: z.string(),
  promptVersion: z.string(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  cacheReadTokens: z.number().int(),
  cacheWriteTokens: z.number().int(),
  estimatedUsd: z.number(),
  durationMs: z.number().int(),
  /** Categories whose model call failed; the rest of the report is still valid. */
  partialCategories: z.array(CategorySchema),
  startedAt: z.string(),
});
export type RunInfo = z.infer<typeof RunInfoSchema>;

export const ExtractedReportSchema = z.object({
  summary: ReportSummarySchema,
  goals: z.array(GoalSchema),
  bmps: z.array(BmpSchema),
  implementation: z.array(ImplementationActivitySchema),
  monitoring: z.array(MonitoringMetricSchema),
  outreach: z.array(OutreachActivitySchema),
  geographicAreas: z.array(GeographicAreaSchema),
  document: DocumentMetaSchema,
  run: RunInfoSchema,
});
export type ExtractedReport = z.infer<typeof ExtractedReportSchema>;

/** Any extracted item, for code that treats the six categories uniformly. */
export type ReportItem =
  Goal | BMP | ImplementationActivity | MonitoringMetric | OutreachActivity | GeographicArea;

/** Report array key per category. */
export const CATEGORY_KEYS = {
  goals: "goals",
  bmps: "bmps",
  implementation: "implementation",
  monitoring: "monitoring",
  outreach: "outreach",
  geographic: "geographicAreas",
} as const satisfies Record<(typeof CATEGORIES)[number], keyof ExtractedReport>;
