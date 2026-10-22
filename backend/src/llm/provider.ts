import type { z } from "zod";

/**
 * The one seam between the pipeline and a language model. The pipeline only ever asks for
 * "this schema, from this system prompt and this user message"; providers own SDK details,
 * caching flags, error mapping and token accounting.
 */

export interface SystemBlock {
  text: string;
  /** Mark the end of the stable prefix so the provider can cache it across calls. */
  cache?: boolean;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface LlmRequest<T> {
  /** Short name for logs ("goals", "bmps", "metadata"). */
  label: string;
  schema: z.ZodType<T>;
  system: SystemBlock[];
  user: string;
  maxTokens: number;
}

export interface LlmResult<T> {
  /** Null when the model's output did not satisfy the schema. */
  data: T | null;
  usage: LlmUsage;
  stopReason: string | null;
  /** The output hit `maxTokens`; the caller should split the input and retry. */
  truncated: boolean;
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  extract<T>(request: LlmRequest<T>): Promise<LlmResult<T>>;
  countTokens(text: string): Promise<number>;
}

export const EMPTY_USAGE: LlmUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

export function addUsage(a: LlmUsage, b: LlmUsage): LlmUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

/** Rough token estimate for sizing decisions; the provider's `countTokens` gives the exact figure. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}
