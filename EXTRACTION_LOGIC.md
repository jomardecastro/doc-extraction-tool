# Extraction logic

How a PDF becomes a verified report, stage by stage, with the thresholds that matter. The code
paths are named so each step can be read next to this document.

```
PDF bytes
  │  backend/src/pdf/extract.ts      pdf.js text runs with position and font per page
  ▼
Layout reconstruction
  │  backend/src/pdf/layout.ts       lines, paragraphs, headings, bullets, tables
  ▼
Cleaning
  │  backend/src/pdf/clean.ts        running headers, page numbers, contents, cover, references
  ▼
Sections and serialisation
  │  backend/src/pdf/sections.ts     heading tree, category tags, <page n="..."> text for the model
  ▼
Six category calls (one cached document prefix)
  │  backend/src/llm/*               Claude, JSON by instruction, zod validation, retry/split
  ▼
Verification, dedupe, summary
  │  backend/src/postprocess/*       verbatim-quote check, number check, merge duplicates
  ▼
ExtractedReport (JSON)              shared/src/schemas/report.ts
```

## 1. Text extraction (`pdf/extract.ts`)

pdf.js (`pdfjs-dist`, legacy build) reads each page's text runs with their x/y position, font
size and font resource name. Pages are processed one at a time and released, so a 62 MB,
647-page plan (Ross Barnett 2011) parses in about five seconds inside ~700 MB of RAM; images
are never decoded. Password-protected and malformed files are reported with specific error
codes.

Two checks reject documents the model should never see:

- **No text layer** (scanned): fewer than 50 extractable characters per page on average. The
  18 MB Buttahatchee 2004 plan is such a scan and is refused with a clear message. OCR is out of
  scope.
- **Unreadable encoding**: more than 40% of non-space characters are not letters or digits.

## 2. Layout reconstruction (`pdf/layout.ts`)

pdf.js only gives positioned fragments. Structure is rebuilt from geometry:

| Element        | Rule                                                                                                                                                                                                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Line           | Runs whose baselines are within max(2 pt, 0.35 × font size); superscripts (< 0.8 × body size, < 0.7 × body above the baseline) stay on their line                                                                                                                                                                                                                   |
| Word spacing   | Gap > 0.2 em inserts a space; whitespace-only runs never advance the measured text end (pdf.js emits very wide ones inside tables)                                                                                                                                                                                                                                  |
| Body font      | Weighted mode of font size and of font resource name across the document                                                                                                                                                                                                                                                                                            |
| Heading        | Size ≥ 1.15 × body, or a short line (≤ 14 words) set entirely in a non-body font resource, or a numbered pattern ("3.2 …", "Element c:", "IV."), or ALL CAPS ≤ 12 words. Never a line that ends with a period/semicolon/comma, ends in a function word, or is a figure/table caption                                                                                |
| Bold detection | Text-only extraction has no weight flag, so emphasis = "set in a font resource other than the body font"; a short emphasised line next to a full-width emphasised line is treated as part of a bold paragraph, not a heading                                                                                                                                        |
| Bullet         | Leading •, ◦, −, en/em dash, Symbol/Wingdings private-use glyphs, "1.", "a)", "iv."; a numbered line longer than 70 characters or ending mid-sentence is a list item, not a heading                                                                                                                                                                                 |
| Paragraph      | Consecutive lines with the same left edge and spacing ≤ 1.7 × size are joined; "imple-" + "mentation" is repaired                                                                                                                                                                                                                                                   |
| Table          | Lines whose cells (gaps ≥ 1 em) align with the previous line's cell edges (±8 pt, left or right edge) form a table; two aligned rows suffice when they have ≥ 3 cells, otherwise three. Wrapped cell text (a one-cell line under a known column, inside that column) is folded back into its row; a wrapped first cell waits for its row's numbers on the next line |

The output per page is a list of blocks (`heading`, `paragraph`, `bullet`, `table` with rows).

## 3. Cleaning (`pdf/clean.ts`)

Everything here is a small, named rule:

- **Running headers/footers**: single-line blocks among the first two or last two on a page,
  normalised with digits replaced, dropped when they repeat on ≥ 30% of pages (and ≥ 3 pages).
  Standalone page numbers ("12", "Page 3 of 27", "iv") are always dropped.
- **Table of contents**: a page where ≥ 40% of lines end in dot leaders and a page number, or
  ≥ 20% under a "Contents"/"List of Tables" heading, or ≥ 30% when the previous page was a
  contents page (continuation pages without a heading).
- **Cover and front matter**: page 1 with under 1,500 characters or "Prepared for/by",
  "Submitted to", "funded by"-type markers and no main heading; pages 2 to 4 with such markers
  before the first content page; acknowledgement-only pages.
- **Administrative sections**: acronym lists, glossary, references/literature cited, from their
  heading to the next heading (carried onto the next page when they span pages).
- **Boilerplate lines**: short blocks with phone numbers, emails, "P.O. Box", URLs, or
  "This project was funded…" sentences.
- **Appendices**: from a page whose first heading, or whose display-size title, is
  "Appendix X" onward, pages are tagged `supporting` rather than dropped: the funded-proposal
  appendices of the older plans repeat the main text, and the prompt tells the model to use
  them only for details the main text lacks.

Pages are labelled `main`, `administrative` or `supporting`; blocks inside content pages can be
labelled `administrative` individually. Only `main` and `supporting` text reaches the category
calls. The metadata call sees the first four pages including the cover.

## 4. Sections and the model's view of the document (`pdf/sections.ts`)

Headings open sections; each section is tagged with the categories its title suggests
("Management Measures|BMP" → bmps, "Monitoring|Criteria|Indicators" → monitoring, and so on).
The document is rendered as plain text with one element per page:

```
<page n="7" section="Element d: Technical and Financial Assistance" tags="implementation">
### Element d: Technical and Financial Assistance
As part of any Section 319 funded project, MDEQ requires a 40% match ...
[table]
Grade Stabilization Structure (#) | 32 @ $6,480 | $207,360
Water Control Structure (#) | 82 @ $2,400 | $196,800
[/table]
</page>
```

The page attribute is how the model learns page numbers for provenance; the section and tags
tell it what kind of statement it is reading. Tagged section titles are also listed in each
category's instructions as hints ("sections most likely to contain this category").

## 5. The model calls (`llm/`)

**One cached prefix, six calls.** The system prompt is [primer + rules] followed by the whole
serialised document with a cache breakpoint on it. The six category calls differ only in the
user message (category instructions plus the JSON Schema of that category's item type), so the
document is billed once per run and read from cache five times. The first call runs alone to
write the cache; the other five run three at a time.

**Why JSON by instruction, not server-side structured outputs.** Structured outputs were the
first implementation. Two facts of the API made them the wrong tool here: the output grammar is
part of the prompt-cache prefix, so six category grammars meant six full-document cache writes
(zero cache reads, measured), and one shared six-array grammar exceeds the API's limits on
union-typed parameters (16) and compiled grammar size. Asking for a bare JSON object instead
keeps the prefix byte-identical across calls. The reply is parsed (`llm/json.ts` finds the
first balanced object, tolerating prose or fences), normalised toward the schema (enum
spelling, numbers written with commas or dollar signs, missing optional fields set to null)
and validated with zod. A reply that still fails validation is retried once with a correction
note; a second failure marks the category `partial` and the rest of the report still ships.

**Output truncation.** If a reply stops at `max_tokens` (16,000 by default), the page range is
split in two and each half is extracted on its own (recursively, at most twice), then merged.

**Long documents.** Above roughly 180k tokens each category call receives only the sections
tagged for it plus the outline; above `MAX_DOC_TOKENS` (400k) the document is rejected with a
clear message rather than silently truncated.

**The prompt's main-content rule** (see `llm/prompts/system.ts`): extract only what the plan
commits to, proposes, funds, measures or reports for this watershed; skip definitions of general
concepts, hypothetical examples in explanatory prose, descriptions of other programs, EPA
checklist text, acknowledgements, references and boilerplate. One item per distinct thing.
Every item carries `sourceQuote` (verbatim, one page, ≤ 300 characters, containing the name and
every number used), `page`, `sectionTitle` and `confidence`.

**Model and effort.** `claude-opus-5-5` at effort `high` by default (adaptive thinking on);
both are environment settings. Cost per document is reported in the UI and recorded per run.

## 6. Verification: the zero-false-positive guarantee (`postprocess/verify.ts`)

The model's provenance claims are checked deterministically against the text extracted in
stage 1 (all pages, including administrative ones, so any real quote can be found):

1. The quote is normalised (NFKC, lowercase, curly quotes → straight, dashes unified,
   whitespace collapsed) and searched on the claimed page and its neighbours, then, with all
   punctuation removed (which forgives table separators and hyphenated line breaks), then
   anywhere in the document. Found elsewhere → the page is corrected. Not found → **the item is
   dropped** and counted (`droppedUnverified`, shown in the UI).
2. Every numeric field of a kept item (`targetValue`, `quantity`, `estimatedCost`, `cost`,
   `value`, `count`, `areaValue`, `expectedLoadReduction.value`) must be written in the quote or
   on the page in some normal form (`1200`, `1,200`, `1200.0`), matched at digit boundaries so
   25 never matches 250 or 1,250. A number that is not written there is **nulled**; the item
   stays, because the practice is real even if the figure was not.
3. The item's name should appear on the page. Missing entirely → confidence `low`; most of its
   content words present → confidence lowered one step. Confidence is only ever lowered.

Consequence: every name, quote and number in a report exists in the PDF. The verifier's own
precision is measured in the evaluation (`post-validator false-positive rate`, see TESTING.md).

## 7. Dedupe and summary (`postprocess/dedupe.ts`, `summary.ts`)

Items with the same name key (lowercase, punctuation and stopwords removed, simple plurals
folded) are merged: the higher-confidence item wins, null fields are filled from the duplicate
and list fields are unioned, so a practice quoted once with a quantity and once with a cost ends
up with both. The summary counts items per category, verified rate, dropped items, BMPs by
category and items by status; `completionRate` is completed ÷ (completed + in progress +
planned) over BMPs and implementation activities, with an explicit "no status data" basis when
a plan (typically pre-implementation) states no statuses.

## 8. Caching and cost control

- **Text cache**: the parsed document is stored by SHA-256 of the PDF, so re-uploads skip pdf.js.
- **Result cache**: reports are stored by (SHA-256, model, prompt version); the same PDF is
  never billed twice for the same prompt. "Re-run live" bypasses it.
- **Prompt cache**: see section 5.
- **Daily budget**: estimated spend is accumulated per day; above `DAILY_USD_CAP` new uploads
  are refused with a clear message while cached results and precomputed samples keep working.

## Known limitations

- Scanned PDFs are refused (no OCR).
- Multi-column body text (rare in these plans) would interleave at the line level.
- Tables whose cells wrap over several lines in the first column may fold a new row into the
  previous one when the previous cell ends mid-sentence; the model still sees all the text.
- The verifier matches text, not meaning: a correctly quoted sentence that the model
  misclassified passes verification; categorisation accuracy is measured separately in the eval.
