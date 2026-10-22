import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "../errors.js";
import type { Effort } from "../config.js";
import { extractJsonObject, normalizeForSchema } from "./json.js";
import type { LlmProvider, LlmRequest, LlmResult } from "./provider.js";

/**
 * Claude through the official SDK.
 *
 * The reply is requested as a bare JSON object and validated against the zod schema here
 * (after light normalisation of enum spelling and number formatting). Server-side structured
 * outputs were tried first and rejected on purpose: the output grammar is part of the prompt
 * cache prefix, so six category calls with six grammars re-billed the whole document six
 * times, and one shared grammar exceeds the API's union and grammar-size limits. With plain
 * JSON the six calls share one cached prefix and the document is billed once per run.
 *
 * Adaptive thinking is on by default for this model family; `effort` is the dial that trades
 * thoroughness for cost and latency.
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
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: request.maxTokens,
        system: request.system.map((block) =>
          block.cache
            ? {
                type: "text" as const,
                text: block.text,
                cache_control: { type: "ephemeral" as const },
              }
            : { type: "text" as const, text: block.text },
        ),
        messages: [{ role: "user", content: request.user }],
        output_config: { effort: this.effort },
      });

      if (response.stop_reason === "refusal") {
        throw new AppError("llm_refused", undefined, { cause: response.stop_details ?? undefined });
      }
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n");
      const truncated = response.stop_reason === "max_tokens";
      const raw = truncated ? null : extractJsonObject(text);
      const parsed =
        raw === null ? null : request.schema.safeParse(normalizeForSchema(raw, request.schema));

      return {
        data: parsed?.success ? parsed.data : null,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
        },
        stopReason: response.stop_reason,
        truncated,
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
  if (
    err instanceof Anthropic.AuthenticationError ||
    err instanceof Anthropic.PermissionDeniedError
  ) {
    return new AppError("llm_auth", undefined, { cause: err });
  }
  if (err instanceof Anthropic.RateLimitError)
    return new AppError("llm_rate_limited", undefined, { cause: err });
  if (err instanceof Anthropic.BadRequestError) {
    if (/prompt is too long|too many tokens|context window/i.test(err.message)) {
      return new AppError("document_too_long", undefined, { cause: err });
    }
    if (/credit balance|billing|plans & billing/i.test(err.message)) {
      return new AppError(
        "llm_auth",
        "The language model account has no remaining credit. Add credit to the Anthropic account behind ANTHROPIC_API_KEY.",
        { cause: err },
      );
    }
    return new AppError("internal", `The language model rejected the request: ${err.message}`, {
      cause: err,
      retryable: false,
    });
  }
  if (err instanceof Anthropic.InternalServerError)
    return new AppError("llm_overloaded", undefined, { cause: err });
  if (err instanceof Anthropic.APIConnectionError) {
    return new AppError("llm_overloaded", "Could not reach the language model service.", {
      cause: err,
    });
  }
  if (err instanceof Anthropic.APIError) {
    return new AppError("internal", `Language model error ${err.status ?? ""}: ${err.message}`, {
      cause: err,
    });
  }
  return new AppError("internal", undefined, { cause: err });
}
