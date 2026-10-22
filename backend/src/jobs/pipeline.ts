import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pLimit from "p-limit";
import {
  CATEGORIES,
  CATEGORY_KEYS,
  ExtractedReportSchema,
  type Category,
  type ExtractedReport,
  type JobStage,
  type LlmDocumentMeta,
} from "@det/shared";
import type { Config } from "../config.js";
import { AppError } from "../errors.js";
import type { Budget } from "../llm/budget.js";
import { runCategory } from "../llm/extract-category.js";
import { estimateUsd } from "../llm/pricing.js";
import { extractMetadata } from "../llm/prompts/metadata.js";
import { buildSystemBlocks, PROMPT_VERSION } from "../llm/prompts/system.js";
import { addUsage, EMPTY_USAGE, estimateTokens, type LlmProvider, type LlmUsage } from "../llm/provider.js";
import { extractDocument, serializeDocument, type ExtractedDocument } from "../pdf/index.js";
import { dedupeItems } from "../postprocess/dedupe.js";
import { buildSummary } from "../postprocess/summary.js";
import { pageTexts, verifyItems } from "../postprocess/verify.js";

export interface PipelineDeps {
  provider: LlmProvider;
  config: Config;
  budget?: Budget;
  log?: (message: string, data?: Record<string, unknown>) => void;
}

export interface PipelineInput {
  data: Uint8Array;
  filename: string;
  sha256: string;
}

export interface PipelineProgress {
  stage: JobStage;
  pages?: number;
  completedCategories?: Category[];
}

export interface PipelineOptions {
  onProgress?: (progress: PipelineProgress) => void;
  /** Serve a stored result for the same PDF, model and prompt version. Default true. */
  useResultCache?: boolean;
  /** Reuse the parsed text of a PDF seen before. Default true. */
  useTextCache?: boolean;
}

export interface PipelineOutput {
  report: ExtractedReport;
  cached: boolean;
}

/** Fields checked by the verifier for each category: a number not written in the source is nulled. */
const NUMERIC_FIELDS: Record<Category, string[]> = {
  goals: ["targetValue"],
  bmps: ["quantity", "estimatedCost", "expectedLoadReduction.value"],
  implementation: ["cost"],
  monitoring: ["value"],
  outreach: ["count"],
  geographic: ["areaValue"],
};

/** Above this many tokens, each category call sees only the sections tagged for it. */
const FOCUSED_THRESHOLD_TOKENS = 180_000;

/**
 * PDF bytes -> verified report. Stages are reported through `onProgress` in the order the UI's
 * stepper shows them. The whole run is deterministic given the model's answers, and every
 * expensive step is cached by content hash so reprocessing the same file is free.
 */
export async function runPipeline(input: PipelineInput, deps: PipelineDeps, options: PipelineOptions = {}): Promise<PipelineOutput> {
  const { provider, config } = deps;
  const log = deps.log ?? (() => {});
  const progress = options.onProgress ?? (() => {});
  const started = Date.now();

  const resultFile = path.join(config.DATA_DIR, "results", `${input.sha256}-${safe(provider.model)}-${safe(PROMPT_VERSION)}.json`);
  if (options.useResultCache !== false) {
    const cached = await readJson<ExtractedReport>(resultFile);
    if (cached) {
      log("result cache hit", { file: resultFile });
      progress({ stage: "done", pages: cached.document.pages });
      return { report: cached, cached: true };
    }
  }

  if (deps.budget) await deps.budget.check();

  // 1. PDF -> structured text
  progress({ stage: "extracting_text" });
  const textFile = path.join(config.DATA_DIR, "cache", `${input.sha256}.doc.json`);
  let doc = options.useTextCache !== false ? await readJson<ExtractedDocument>(textFile) : null;
  if (!doc) {
    doc = await extractDocument(input.data, { onPage: (done, total) => progress({ stage: "extracting_text", pages: total }) });
    await writeJson(textFile, doc);
  }
  progress({ stage: "cleaning", pages: doc.stats.pageCount });
  progress({ stage: "segmenting", pages: doc.stats.pageCount });

  // 2. Size the prompt
  const serialized = serializeDocument(doc);
  const approxTokens = estimateTokens(serialized);
  if (approxTokens > config.MAX_DOC_TOKENS) {
    throw new AppError("document_too_long", `The document text is about ${approxTokens.toLocaleString()} tokens; the limit is ${config.MAX_DOC_TOKENS.toLocaleString()}.`);
  }
  const focused = approxTokens > FOCUSED_THRESHOLD_TOKENS;
  const systemBlocks = focused ? undefined : buildSystemBlocks(serialized);
  log("document ready", { pages: doc.stats.pageCount, approxTokens, focused, sections: doc.sections.length });

  // 3. Category calls: the first one alone (it writes the prompt cache), the rest in parallel.
  const pages = pageTexts(doc);
  let usage: LlmUsage = EMPTY_USAGE;
  const partial: Category[] = [];
  const completed: Category[] = [];
  let droppedUnverified = 0;
  const results: Partial<Record<Category, unknown[]>> = {};

  const runOne = async (category: Category) => {
    progress({ stage: `llm_${category}` as JobStage, completedCategories: [...completed] });
    try {
      const run = await runCategory<ItemLike>(provider, category, doc!, {
        maxTokens: config.LLM_MAX_OUTPUT_TOKENS,
        focused,
        ...(systemBlocks ? { systemBlocks } : {}),
      });
      usage = addUsage(usage, run.usage);
      const verified = verifyItems(run.items, pages, NUMERIC_FIELDS[category]);
      const deduped = dedupeItems(verified.items);
      droppedUnverified += verified.stats.dropped;
      results[category] = deduped.items.map((item) => ({ ...item, id: itemId(category, item.name) }));
      log(`category ${category}`, {
        returned: run.items.length,
        kept: verified.stats.kept,
        dropped: verified.stats.dropped,
        pageCorrected: verified.stats.pageCorrected,
        numbersNulled: verified.stats.numbersNulled,
        merged: deduped.merged,
        calls: run.calls,
        cacheRead: run.usage.cacheReadTokens,
        cacheWrite: run.usage.cacheWriteTokens,
      });
    } catch (err) {
      if (err instanceof AppError && (err.code === "llm_auth" || err.code === "document_too_long" || err.code === "llm_refused")) throw err;
      log(`category ${category} failed`, { error: err instanceof Error ? err.message : String(err) });
      partial.push(category);
      results[category] = [];
    } finally {
      completed.push(category);
    }
  };

  await runOne(CATEGORIES[0]);
  const limit = pLimit(config.LLM_CATEGORY_CONCURRENCY);
  await Promise.all(CATEGORIES.slice(1).map((category) => limit(() => runOne(category))));
  if (partial.length === CATEGORIES.length) {
    throw new AppError("llm_invalid_output", "No category could be extracted from this document.");
  }

  // 4. Identify the document (small call; sees the cover pages)
  progress({ stage: "llm_metadata", completedCategories: [...completed] });
  let meta: LlmDocumentMeta = { title: input.filename.replace(/\.pdf$/i, ""), planYear: null, planFamily: "other", watershedName: null, hucCodes: [], organizations: [] };
  try {
    const metaResult = await extractMetadata(provider, doc);
    usage = addUsage(usage, metaResult.usage);
    if (metaResult.data) meta = metaResult.data;
  } catch (err) {
    log("metadata failed", { error: err instanceof Error ? err.message : String(err) });
  }

  // 5. Assemble
  progress({ stage: "validating", completedCategories: [...completed] });
  const parts = {
    goals: (results.goals ?? []) as ExtractedReport["goals"],
    bmps: (results.bmps ?? []) as ExtractedReport["bmps"],
    implementation: (results.implementation ?? []) as ExtractedReport["implementation"],
    monitoring: (results.monitoring ?? []) as ExtractedReport["monitoring"],
    outreach: (results.outreach ?? []) as ExtractedReport["outreach"],
    geographicAreas: (results.geographic ?? []) as ExtractedReport["geographicAreas"],
  };
  const estimatedUsd = estimateUsd(usage, provider.model);
  const report: ExtractedReport = {
    summary: buildSummary(parts, droppedUnverified),
    ...parts,
    document: { ...meta, pages: doc.stats.pageCount, administrativePages: doc.stats.administrativePages },
    run: {
      provider: provider.name,
      model: provider.model,
      promptVersion: PROMPT_VERSION,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      estimatedUsd,
      durationMs: Date.now() - started,
      partialCategories: partial,
      startedAt: new Date(started).toISOString(),
    },
  };
  // Validate our own output so a schema drift fails here, not in the UI.
  const checked = ExtractedReportSchema.parse(report);

  if (deps.budget) await deps.budget.add(estimatedUsd);
  // A report with failed categories is served once but never stored: the next upload of the same
  // file should get a complete run, not the partial one.
  if (options.useResultCache !== false && partial.length === 0) await writeJson(resultFile, checked);
  progress({ stage: "done", pages: doc.stats.pageCount, completedCategories: [...completed] });
  log("pipeline done", { estimatedUsd, durationMs: checked.run.durationMs, partial });
  return { report: checked, cached: false };
}

interface ItemLike {
  name: string;
  page: number;
  sourceQuote: string;
  confidence: "high" | "medium" | "low";
}

export function itemId(category: Category, name: string): string {
  return createHash("sha1").update(`${category}:${name.toLowerCase().trim()}`).digest("hex").slice(0, 12);
}

export function sha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Keep the category -> report key mapping in one place for export code. */
export { CATEGORY_KEYS };

function safe(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value));
}
