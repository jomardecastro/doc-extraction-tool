# DocExtract

Upload a watershed plan PDF and get its substance back as structured data: goals, best
management practices, implementation activities, monitoring metrics, outreach activities and
geographic areas, each with a verbatim quote and page number that has been checked against the
PDF. Built for the Mississippi Department of Environmental Quality's watershed plans, which
come in two families (narrative implementation plans from 2004 onward and EPA nine-element
plans from 2017 onward) and range from 12 to 650 pages and from 300 KB to 62 MB.

**Live demo:** https://docextract.jdecastro.dev (no login; try a bundled sample or upload a
plan from the [MDEQ list](https://www.mdeq.ms.gov/wp-content/uploads/SurfaceWaterBasinMgtNonPointSourceBranch/Watershed_Plans/MS_Watershed_Plans.htm)).

## What it does

1. **Reads the PDF** with pdf.js, page by page, and rebuilds the document's structure from
   geometry: headings, paragraphs, bullets and tables, with running headers, page numbers,
   contents pages, cover pages and reference lists removed.
2. **Asks Claude** six focused questions (one per category) against one cached copy of the
   document, each answered as JSON that is validated against a schema.
3. **Verifies every item** against the PDF text: the quote must be found verbatim (or the item
   is discarded), every number must be written in the source (or it is nulled), and the name
   must appear on the page (or confidence is lowered). Nothing in a report is unquotable.
4. **Shows a dashboard**: totals, three charts, six category tables with the source quote one
   click away, and JSON/CSV/Excel export.

The approach, thresholds and the reasons behind them are in [EXTRACTION_LOGIC.md](EXTRACTION_LOGIC.md).
Measured accuracy against hand-labelled plans is in [TESTING.md](TESTING.md). Running and
deploying it is in [DEPLOYMENT.md](DEPLOYMENT.md).

## Quick start

```bash
cp .env.example .env     # set ANTHROPIC_API_KEY, or LLM_PROVIDER=mock to run without a key
docker compose up --build
# open http://localhost:3120
```

Without Docker (Node 24, pnpm 9): `pnpm install && pnpm dev`, then open http://localhost:5173.

## Architecture

```
frontend/   React 19 + Vite + Tailwind 4 + Recharts     upload, progress, dashboard, export
backend/    Fastify 5 + pdf.js + Anthropic SDK + zod     streaming upload, job queue, pipeline, verifier, exports
shared/     zod schemas and types for the report, job and error vocabulary (used by both)
eval/       gold labels, matcher and runner for the accuracy harness
ops/        Dockerfile support: nginx templates, deploy and bootstrap scripts
```

The backend serves the built frontend in production, so one container is the whole app.

Request flow: `POST /api/documents` streams the PDF to disk while hashing it and returns a job
id in milliseconds; a single-worker queue runs the pipeline; the browser polls
`GET /api/documents/:id` every two seconds for the stage, progress and, finally, the report.
Results are cached by content hash, model and prompt version, so re-uploading a known file is
instant and free.

## Output shape

```ts
interface ExtractedReport {
  summary: { totalGoals; totalBMPs; completionRate; completionRateBasis; verifiedRate; droppedUnverified; ... };
  goals: Goal[];                    // kind, pollutants, targetValue/Unit/Text, timeframe
  bmps: BMP[];                      // category, quantity, unit, estimatedCost, status, location, expectedLoadReduction
  implementation: ImplementationActivity[];  // responsibleParty, timeframe, isMilestone, status, relatedBmp, cost
  monitoring: MonitoringMetric[];   // parameter, value, unit, valueKind (target/baseline/achieved/threshold), comparator, frequency
  outreach: OutreachActivity[];     // activityType, audience, count, timeframe, responsibleParty
  geographicAreas: GeographicArea[]; // areaType, hucCode, areaValue, areaUnit, isPrimary
  document: { title; planYear; planFamily; watershedName; hucCodes; organizations; pages; administrativePages };
  run: { model; promptVersion; tokens; cacheReadTokens; estimatedUsd; durationMs; partialCategories };
}
```

Every item also carries `page`, `sourceQuote`, `sectionTitle`, `confidence` and `verified`.
The full schema is `shared/src/schemas/report.ts`.

## Scripts

| Command                                                               | What it does                                       |
| --------------------------------------------------------------------- | -------------------------------------------------- |
| `pnpm dev`                                                            | API with pretty logs on :3000 and Vite on :5173    |
| `pnpm check`                                                          | typecheck, lint, format check, unit tests          |
| `pnpm build`                                                          | frontend bundle and backend bundle                 |
| `pnpm extract-text <pdf> [--blocks\|--pages\|--all]`                  | print what the model sees (debug the PDF layer)    |
| `pnpm run-pipeline <pdf> [--provider mock] [--model id] [--no-cache]` | one extraction from the command line               |
| `pnpm eval:fetch`                                                     | download the evaluation PDFs from MDEQ             |
| `pnpm eval [--doc slug] [--draft slug]`                               | run and score the accuracy harness                 |
| `pnpm package`                                                        | build the submission zip                           |
| `ops/deploy.sh`                                                       | build, smoke-test, ship and switch the demo server |

## Limits, stated plainly

- Text-based PDFs only. A scanned plan is detected and refused with a clear message; there is
  no OCR.
- Claude is the only production model path (`LLM_MODEL` picks the model). The API costs
  roughly $1 to $3 per plan on Opus 5.5; a daily cap protects the demo key.
- Accuracy is measured on five hand-labelled plans (see TESTING.md); the plans the reviewers
  test with may differ in format, which is why the layout and cleaning rules are generic
  rather than tuned to specific documents.
