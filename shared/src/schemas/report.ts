import { z } from "zod";
import { CATEGORIES } from "../categories.js";

/**
 * The extraction data model.
 *
 * Two layers of schema per item type:
 *  - `Llm*`: what the model is asked to produce. Every field is required and nullable rather than
 *    optional, enums are closed, and there are no string formats or length limits, because that
 *    is what structured-output JSON schemas support and because a model forced to fill every
 *    field is less likely to drop provenance.
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
  page: z.number().int(),
  sourceQuote: z.string(),
  sectionTitle: z.string().nullable(),
  confidence: ConfidenceSchema,
};

const serverFields = {
  id: z.string(),
  /** True when `sourceQuote` was found verbatim in the extracted PDF text. */
  verified: z.boolean(),
};

// ---- Goals ----------------------------------------------------------------------------------

export const LlmGoalSchema = z.object({
  name: z.string(),
  description: z.string(),
  kind: z.enum(["goal", "objective"]),
  pollutants: z.array(z.string()),
  targetValue: z.number().nullable(),
  targetUnit: z.string().nullable(),
  /** The target as written when it is not a single number ("reduce sediment by 35% to 56%"). */
  targetText: z.string().nullable(),
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
  name: z.string(),
  description: z.string(),
  category: BmpCategorySchema,
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  estimatedCost: z.number().nullable(),
  targetPollutants: z.array(z.string()),
  expectedLoadReduction: LoadReductionSchema.nullable(),
  status: StatusSchema,
  location: z.string().nullable(),
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
  timeframe: z.string().nullable(),
  isMilestone: z.boolean(),
  status: StatusSchema,
  relatedBmp: z.string().nullable(),
  cost: z.number().nullable(),
  ...provenanceFields,
});
export const ImplementationActivitySchema = LlmImplementationActivitySchema.extend(serverFields);
export type LlmImplementationActivity = z.infer<typeof LlmImplementationActivitySchema>;
export type ImplementationActivity = z.infer<typeof ImplementationActivitySchema>;

// ---- Monitoring metrics ---------------------------------------------------------------------

export const MetricTypeSchema = z.enum(["water_quality", "biological", "implementation", "social", "other"]);
export const ValueKindSchema = z.enum(["target", "baseline", "achieved", "threshold", "unspecified"]);
export const ComparatorSchema = z.enum(["<", "<=", "=", ">=", ">"]);

export const LlmMonitoringMetricSchema = z.object({
  name: z.string(),
  description: z.string(),
  metricType: MetricTypeSchema,
  /** The measured parameter: "Total Suspended Solids", "Dissolved Oxygen", "fecal coliform"... */
  parameter: z.string(),
  value: z.number().nullable(),
  unit: z.string().nullable(),
  valueKind: ValueKindSchema,
  comparator: ComparatorSchema.nullable(),
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
  count: z.number().nullable(),
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
  hucCode: z.string().nullable(),
  areaValue: z.number().nullable(),
  areaUnit: z.string().nullable(),
  /** The watershed the plan is about, as opposed to places merely mentioned. */
  isPrimary: z.boolean(),
  ...provenanceFields,
});
export const GeographicAreaSchema = LlmGeographicAreaSchema.extend(serverFields);
export type LlmGeographicArea = z.infer<typeof LlmGeographicAreaSchema>;
export type GeographicArea = z.infer<typeof GeographicAreaSchema>;

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
export type ReportItem = Goal | BMP | ImplementationActivity | MonitoringMetric | OutreachActivity | GeographicArea;

/** Report array key per category. */
export const CATEGORY_KEYS = {
  goals: "goals",
  bmps: "bmps",
  implementation: "implementation",
  monitoring: "monitoring",
  outreach: "outreach",
  geographic: "geographicAreas",
} as const satisfies Record<(typeof CATEGORIES)[number], keyof ExtractedReport>;
