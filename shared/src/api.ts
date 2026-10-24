import type { Category } from "./categories.js";
import type { ApiError } from "./errors.js";
import type { ExtractedReport, PlanFamily } from "./schemas/report.js";

/** Lifecycle of one uploaded document. */
export type JobStatus = "queued" | "processing" | "done" | "failed";

/**
 * Pipeline stages in order. The UI renders them as a stepper; `pct` is derived from a weight
 * table on the server so the bar moves at a sensible pace.
 */
export const JOB_STAGES = [
  "queued",
  "extracting_text",
  "cleaning",
  "segmenting",
  "llm_metadata",
  "llm_goals",
  "llm_bmps",
  "llm_implementation",
  "llm_monitoring",
  "llm_outreach",
  "llm_geographic",
  "validating",
  "done",
  "failed",
] as const;
export type JobStage = (typeof JOB_STAGES)[number];

export const JOB_STAGE_LABELS: Record<JobStage, string> = {
  queued: "Waiting in queue",
  extracting_text: "Reading PDF text",
  cleaning: "Removing headers, contents and boilerplate",
  segmenting: "Finding sections",
  llm_metadata: "Identifying the document",
  llm_goals: "Extracting goals",
  llm_bmps: "Extracting BMPs",
  llm_implementation: "Extracting implementation activities",
  llm_monitoring: "Extracting monitoring metrics",
  llm_outreach: "Extracting outreach activities",
  llm_geographic: "Extracting geographic areas",
  validating: "Verifying quotes against the PDF",
  done: "Done",
  failed: "Failed",
};

export interface JobView {
  id: string;
  status: JobStatus;
  stage: JobStage;
  /** 0..100 */
  pct: number;
  filename: string;
  sizeBytes: number;
  pages: number | null;
  createdAt: string;
  updatedAt: string;
  /** True when the result came from the cache (same PDF processed before with the same prompt and model). */
  cached: boolean;
  /** Categories that have finished so far, for the stepper. */
  completedCategories: Category[];
  error: ApiError | null;
  result: ExtractedReport | null;
}

export interface UploadAccepted {
  id: string;
  status: JobStatus;
  cached: boolean;
}

export interface SampleInfo {
  id: string;
  title: string;
  year: number;
  family: PlanFamily;
  sizeBytes: number;
  pages: number;
  description: string;
  /** Present when a precomputed result ships with the app, so the sample opens instantly. */
  precomputed: boolean;
}

export interface HealthView {
  ok: boolean;
  version: string;
  provider: string;
  model: string;
  uptimeSeconds: number;
  queue: { active: number; waiting: number };
  budget: { usedUsd: number; capUsd: number };
  /** Download link for the source archive, when the deployment provides one. */
  sourceZipUrl: string | null;
}

export type ExportFormat = "json" | "csv" | "xlsx";
