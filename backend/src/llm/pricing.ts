import type { LlmUsage } from "./provider.js";

/** USD per million tokens. Cache writes cost 1.25x input; cache reads are a tenth or less. */
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

// Anthropic list prices as of 2026-10. Unknown models fall back to Opus pricing so the budget
// cap errs on the side of overestimating.
const PRICES: Array<[prefix: string, price: ModelPrice]> = [
  ["claude-opus-5-5", { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 }],
  ["claude-opus-5", { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 }],
  ["claude-sonnet-5-5", { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 }],
  ["claude-sonnet-5", { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 }],
  ["claude-haiku-5-5", { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 }],
  ["claude-haiku-4-5", { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 }],
  ["mock", { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }],
];

export function priceFor(model: string): ModelPrice {
  const hit = PRICES.find(([prefix]) => model.startsWith(prefix));
  return hit ? hit[1] : PRICES[0]![1];
}

export function estimateUsd(usage: LlmUsage, model: string): number {
  const p = priceFor(model);
  const usd =
    (usage.inputTokens * p.input +
      usage.outputTokens * p.output +
      usage.cacheReadTokens * p.cacheRead +
      usage.cacheWriteTokens * p.cacheWrite) /
    1_000_000;
  return Math.round(usd * 10000) / 10000;
}
