import type { LlmProvider, LlmRequest, LlmResult } from "./provider.js";
import { estimateTokens } from "./provider.js";

/**
 * A key-less provider for smoke tests and CI. It does not understand the document; it pulls a
 * few sentences that mention each category's keywords, quoting them verbatim with their page
 * number, so the downstream verifier, dedupe, summary and UI all run on realistic-looking data.
 * Results are clearly labelled "mock" in the report's run info.
 */
export class MockProvider implements LlmProvider {
  readonly name = "mock";
  readonly model = "mock";

  async extract<T>(request: LlmRequest<T>): Promise<LlmResult<T>> {
    const document = request.system.map((b) => b.text).join("\n");
    const pages = parsePages(document);
    const candidate =
      request.label === "metadata"
        ? mockMetadata(pages)
        : {
            goals: [],
            bmps: [],
            implementation: [],
            monitoring: [],
            outreach: [],
            geographic: [],
            [request.label]: mockItems(request.label, pages),
          };
    const parsed = request.schema.safeParse(candidate);
    return {
      data: parsed.success ? parsed.data : null,
      usage: {
        inputTokens: estimateTokens(document) + estimateTokens(request.user),
        outputTokens: 200,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      stopReason: "end_turn",
      truncated: false,
    };
  }

  async countTokens(text: string): Promise<number> {
    return estimateTokens(text);
  }
}

interface MockPage {
  page: number;
  section: string | null;
  sentences: string[];
}

function parsePages(document: string): MockPage[] {
  const pages: MockPage[] = [];
  const re = /<page n="(\d+)"(?:[^>]*section="([^"]*)")?[^>]*>([\s\S]*?)<\/page>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(document)) !== null) {
    const text = m[3]!.replace(/^#+\s.*$/gm, "").replace(/\[\/?table\]/g, "");
    const sentences = text
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.replace(/^\s*-\s*/, "").trim())
      .filter((s) => s.length >= 40 && s.length <= 280);
    pages.push({ page: Number(m[1]), section: m[2] ?? null, sentences });
  }
  return pages;
}

const KEYWORDS: Record<string, RegExp> = {
  goals: /\b(goal|objective|reduce|improve|restore|achieve|target)\b/i,
  bmps: /\b(bmp|practice|structure|buffer|cover crop|fencing|stabilization|septic|riparian|management measure)\b/i,
  implementation: /\b(shall|will|implement|install|schedule|milestone|month|year|phase)\b/i,
  monitoring: /\b(monitor|sampl|mg\/l|criteria|indicator|data|measure|assess)\b/i,
  outreach: /\b(education|outreach|workshop|meeting|public|landowner|students|stakeholder)\b/i,
  geographic: /\b(watershed|county|huc|acres|creek|river|lake|bayou|basin)\b/i,
};

function mockItems(label: string, pages: MockPage[]): Record<string, unknown>[] {
  const re = KEYWORDS[label];
  if (!re) return [];
  const items: Record<string, unknown>[] = [];
  for (const page of pages) {
    for (const sentence of page.sentences) {
      if (!re.test(sentence)) continue;
      items.push(mockItem(label, sentence, page));
      if (items.length >= 6) return items;
    }
  }
  return items;
}

function mockItem(label: string, sentence: string, page: MockPage): Record<string, unknown> {
  const name = sentence.split(/[,;:(]/)[0]!.trim().slice(0, 70);
  const base = {
    name,
    description: `Mock extraction of: ${sentence.slice(0, 120)}`,
    page: page.page,
    sourceQuote: sentence,
    sectionTitle: page.section,
    confidence: "low",
  };
  switch (label) {
    case "goals":
      return { ...base, kind: "goal", pollutants: [], targetValue: null, targetUnit: null, targetText: null, timeframe: null };
    case "bmps":
      return {
        ...base,
        category: "other",
        quantity: null,
        unit: null,
        estimatedCost: null,
        targetPollutants: [],
        expectedLoadReduction: null,
        status: "unknown",
        location: null,
      };
    case "implementation":
      return { ...base, responsibleParty: null, timeframe: null, isMilestone: false, status: "unknown", relatedBmp: null, cost: null };
    case "monitoring":
      return {
        ...base,
        metricType: "other",
        parameter: name,
        value: null,
        unit: null,
        valueKind: "unspecified",
        comparator: null,
        location: null,
        frequency: null,
        responsibleParty: null,
      };
    case "outreach":
      return { ...base, activityType: "other", audience: null, count: null, timeframe: null, responsibleParty: null };
    default:
      return { ...base, areaType: "other", hucCode: null, areaValue: null, areaUnit: null, isPrimary: false };
  }
}

function mockMetadata(pages: MockPage[]): Record<string, unknown> {
  const first = pages[0]?.sentences[0] ?? "Untitled document";
  return {
    title: first.slice(0, 80),
    planYear: null,
    planFamily: "other",
    watershedName: null,
    hucCodes: [],
    organizations: [],
  };
}
