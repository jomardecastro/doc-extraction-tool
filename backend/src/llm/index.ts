import type { Config } from "../config.js";
import { AnthropicProvider } from "./anthropic.js";
import { MockProvider } from "./mock.js";
import type { LlmProvider } from "./provider.js";

export function createProvider(config: Config): LlmProvider {
  if (config.LLM_PROVIDER === "mock") return new MockProvider();
  return new AnthropicProvider({
    apiKey: config.ANTHROPIC_API_KEY!,
    model: config.LLM_MODEL,
    effort: config.LLM_EFFORT,
  });
}

export type { LlmProvider, LlmUsage, LlmRequest, LlmResult } from "./provider.js";
