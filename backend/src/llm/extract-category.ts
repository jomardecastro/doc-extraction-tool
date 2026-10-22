import type { Category } from "@det/shared";
import { AppError } from "../errors.js";
import type { ExtractedDocument } from "../pdf/index.js";
import { serializeDocument } from "../pdf/index.js";
import { addUsage, type LlmProvider, type LlmUsage, type SystemBlock } from "./provider.js";
import { buildUserMessage, outputSchemaFor } from "./prompts/categories.js";
import { buildSystemBlocks } from "./prompts/system.js";

export interface CategoryRun<T> {
  category: Category;
  items: T[];
  usage: LlmUsage;
  /** Number of model calls made (1 unless the output was truncated and the document was split). */
  calls: number;
}

export interface CategoryRunOptions {
  maxTokens: number;
  /** When set, only sections tagged with the category (plus headings) are sent. Used for very long documents. */
  focused?: boolean;
  /** Reuse across categories so the cached prefix is byte-identical. */
  systemBlocks?: SystemBlock[];
}

/**
 * One category, one model call against the cached document prefix (same system blocks for
 * every category; only the user message differs).
 *
 * Two recovery paths keep a bad call from failing the whole report:
 *  - output truncated at max_tokens: the pages are split in two and each half is extracted on
 *    its own (recursively, at most twice), then merged;
 *  - output not matching the schema: one retry with a correction note, then the error propagates
 *    and the pipeline marks the category partial.
 */
export async function runCategory<T>(
  provider: LlmProvider,
  category: Category,
  doc: ExtractedDocument,
  options: CategoryRunOptions,
): Promise<CategoryRun<T>> {
  const relevant = doc.sections
    .filter((s) => s.role !== "administrative" && s.tags.includes(category))
    .map((s) => s.title);
  const user = buildUserMessage(category, relevant);
  const system =
    options.systemBlocks ??
    buildSystemBlocks(serializeDocument(doc, options.focused ? { categories: [category] } : {}));

  const pageNumbers = doc.pages.filter((p) => p.role !== "administrative").map((p) => p.pageNumber);
  const result = await extractPages<T>(
    provider,
    category,
    user,
    system,
    doc,
    pageNumbers,
    options,
    0,
  );
  return { category, items: result.items, usage: result.usage, calls: result.calls };
}

async function extractPages<T>(
  provider: LlmProvider,
  category: Category,
  user: string,
  system: SystemBlock[],
  doc: ExtractedDocument,
  pageNumbers: number[],
  options: CategoryRunOptions,
  depth: number,
): Promise<{ items: T[]; usage: LlmUsage; calls: number }> {
  const schema = outputSchemaFor(category);
  const request = { label: category, schema, system, user, maxTokens: options.maxTokens };
  let result = await provider.extract(request);
  let usage = result.usage;
  let calls = 1;

  if (result.truncated && depth < 2 && pageNumbers.length >= 2) {
    // Too many items for one answer: split the page range and extract each half separately.
    const mid = Math.ceil(pageNumbers.length / 2);
    const halves = [pageNumbers.slice(0, mid), pageNumbers.slice(mid)];
    const parts = await Promise.all(
      halves.map((pages) => {
        const sys = buildSystemBlocks(
          serializeDocument(doc, {
            pages: new Set(pages),
            ...(options.focused ? { categories: [category] } : {}),
          }),
        );
        return extractPages<T>(provider, category, user, sys, doc, pages, options, depth + 1);
      }),
    );
    return {
      items: parts.flatMap((p) => p.items),
      usage: parts.reduce((acc, p) => addUsage(acc, p.usage), usage),
      calls: parts.reduce((n, p) => n + p.calls, calls),
    };
  }

  if (result.data === null && !result.truncated) {
    result = await provider.extract({
      ...request,
      user: `${user}\n\nYour previous answer was not a valid JSON object for this schema. Reply with only the JSON object.`,
    });
    usage = addUsage(usage, result.usage);
    calls++;
  }

  if (result.data === null) {
    throw new AppError("llm_invalid_output", `The model did not return valid ${category} data.`);
  }
  return { items: result.data.items as T[], usage, calls };
}
