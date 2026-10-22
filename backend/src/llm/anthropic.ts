import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AppError } from "../errors.js";
import type { Effort } from "../config.js";
import type { LlmProvider, LlmRequest, LlmResult } from "./provider.js";

/**
 * Claude through the official SDK with structured outputs: the response is validated against
 * the zod schema server-side and arrives already parsed (`parsed_output`), so there is no JSON
 * repair code anywhere in the pipeline. Adaptive thinking is on by default for this model
 * family; `effort` is the dial that trades thoroughness for cost and latency.
 */
export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";
  readonly model: string;
  private readonly client: Anthropic;
  private readonly effort: Effort;

  constructor(options: { apiKey: string; model: string; effort: Effort }) {
    this.model = options.model;
    this.effort = options.effort;
    this.client = new Anthropic({
      apiKey: options.apiKey,
      // A 100-page plan with a 16k-token answer can take several minutes on a high effort setting.
      timeout: 15 * 60 * 1000,
      maxRetries: 4,
    });
  }

  async extract<T>(request: LlmRequest<T>): Promise<LlmResult<T>> {
    try {
      const response = await this.client.messages.parse({
        model: this.model,
        max_tokens: request.maxTokens,
        system: request.system.map((block) =>
          block.cache
            ? { type: "text" as const, text: block.text, cache_control: { type: "ephemeral" as const } }
            : { type: "text" as const, text: block.text },
        ),
        messages: [{ role: "user", content: request.user }],
        output_config: { format: zodOutputFormat(request.schema), effort: this.effort },
      });

      if (response.stop_reason === "refusal") {
        throw new AppError("llm_refused", undefined, { cause: response.stop_details ?? undefined });
      }
      return {
        data: (response.parsed_output as T | null) ?? null,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
        },
        stopReason: response.stop_reason,
        truncated: response.stop_reason === "max_tokens",
      };
    } catch (err) {
      throw mapAnthropicError(err);
    }
  }

  async countTokens(text: string): Promise<number> {
    try {
      const result = await this.client.messages.countTokens({
        model: this.model,
        messages: [{ role: "user", content: text }],
      });
      return result.input_tokens;
    } catch (err) {
      throw mapAnthropicError(err);
    }
  }
}

/** Most specific first: the distinction between retryable and permanent failures drives the UI copy. */
function mapAnthropicError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new AppError("llm_auth", undefined, { cause: err });
  }
  if (err instanceof Anthropic.RateLimitError) return new AppError("llm_rate_limited", undefined, { cause: err });
  if (err instanceof Anthropic.BadRequestError) {
    if (/prompt is too long|too many tokens|context window/i.test(err.message)) {
      return new AppError("document_too_long", undefined, { cause: err });
    }
    return new AppError("internal", `The language model rejected the request: ${err.message}`, { cause: err, retryable: false });
  }
  if (err instanceof Anthropic.InternalServerError) return new AppError("llm_overloaded", undefined, { cause: err });
  if (err instanceof Anthropic.APIConnectionError) {
    return new AppError("llm_overloaded", "Could not reach the language model service.", { cause: err });
  }
  if (err instanceof Anthropic.APIError) {
    return new AppError("internal", `Language model error ${err.status ?? ""}: ${err.message}`, { cause: err });
  }
  return new AppError("internal", undefined, { cause: err });
}
