import { LlmDocumentMetaSchema } from "@det/shared";
import type { ExtractedDocument } from "../../pdf/index.js";
import { serializeDocument } from "../../pdf/index.js";
import type { LlmRequest, LlmProvider } from "../provider.js";
import type { LlmDocumentMeta } from "@det/shared";

/**
 * One small call that reads the front of the document (cover and contents pages included, which
 * the category calls never see) and names the plan: title, year, family, watershed, HUCs and
 * the organisations that prepared it.
 */
export function buildMetadataRequest(doc: ExtractedDocument): LlmRequest<LlmDocumentMeta> {
  const firstPages = new Set(doc.pages.slice(0, 4).map((p) => p.pageNumber));
  const front = serializeDocument(doc, { roles: ["main", "administrative", "supporting"], pages: firstPages });
  const headings = doc.sections
    .filter((s) => s.role !== "administrative")
    .slice(0, 40)
    .map((s) => `${"#".repeat(Math.min(3, s.level))} ${s.title} (p. ${s.pageStart})`)
    .join("\n");

  return {
    label: "metadata",
    schema: LlmDocumentMetaSchema,
    system: [
      {
        text: "You identify watershed management plans prepared for the Mississippi Department of Environmental Quality. Answer only from the text given; use null when something is not stated.",
      },
    ],
    user: `Here are the first pages of a document and its outline. Identify it.

Fields: title (the document's own title, without the organisation names); planYear (the year on the cover or in the title, as a number); planFamily ("nine_element" when the document is organised as Element a through Element i or calls itself a 9 Key Element Plan, "watershed_plan" for a watershed implementation/action plan, otherwise "other"); watershedName (the watershed the plan is for); hucCodes (hydrologic unit codes stated, digits only); organizations (groups that prepared, developed or funded the plan).

<front_pages>
${front}
</front_pages>

<outline>
${headings}
</outline>`,
    maxTokens: 2000,
  };
}

export async function extractMetadata(provider: LlmProvider, doc: ExtractedDocument) {
  return provider.extract(buildMetadataRequest(doc));
}
