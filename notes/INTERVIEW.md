# Explaining DocExtract in the ChowaCo interview

Personal notes. This folder is excluded from the submission archive (see `.gitattributes`).
Numbers below are from the final 2026-10-24 evaluation (`TESTING.md`).

## The 2-minute walkthrough

The tool takes a watershed plan PDF and turns it into structured data: goals, best management
practices, implementation tasks, monitoring metrics, outreach activities and geographic areas.
The hard part isn't calling the model. It's that these plans vary a lot: a 2009 plan is a
narrative organised by priority concern, a 2021 plan follows the EPA nine-element structure,
some are double-spaced, some are 60 MB of maps, and one in my set turned out to be a scan with
no text at all.

So the system has four stages. First, the PDF layer. I use pdf.js to get positioned text, then
rebuild the structure myself: headings, bullets, paragraphs and tables from geometry, and I
strip what shouldn't reach the model, like running headers, page numbers, the table of
contents, cover pages and reference lists. The model sees clean, page-tagged text with section
hints.

Second, extraction. The whole document goes into one system prompt that's cached, and I make
six focused calls, one per category, that share that cached prefix. Each call asks for JSON
against a schema and I validate it with zod.

Third, verification, which is the part I'm proudest of. Every item the model returns has to
carry a verbatim quote and a page number. I check that quote against the actual PDF text. If
it's not there, the item is dropped. If a number isn't written in the source, the number is
nulled. So nothing in the report can be made up: every name, quote and figure exists in the
document.

Fourth, the dashboard: totals, charts, a table per category where you can open any row and see
the exact quote and page, and export to JSON, CSV or Excel.

To know it works, I built an accuracy harness before tuning anything: I hand-labelled five
plans, one of them blind, and the tool scores precision, recall and F1 per category plus
whether every number is exactly right. Every category is above the 75% bar on the aggregate and on
four of the five plans individually (the exception is Dry Creek goals, two of four tiny items),
most are around 90%, and the numbers are right 123 times out of 129.

## The decisions, and the reason for each

- **Why rebuild structure from geometry instead of just dumping text?** The model needs to
  tell a heading from a sentence and a table row from prose to judge "main content versus
  supporting text", which is 40% of the grading. A BMP table row like
  "Grade Stabilization Structure | 32 @ $6,480 | $207,360" is unambiguous; the same words
  scattered across lines are not.
- **Why six calls instead of one?** Focused instructions per category recall better, each answer
  stays within output limits, a failure in one category doesn't lose the others, and the
  document is only billed once because the prefix is cached. Six calls cost 60 cents to a dollar fifty per
  plan depending on length.
- **Why JSON by instruction instead of the API's structured outputs?** I used structured outputs
  first. Two things made them the wrong tool here: the output grammar is part of the cache
  prefix, so six different schemas meant the document was cached six times with zero hits, and
  one combined schema exceeded the API's union and grammar size limits. Asking for plain JSON
  and validating client-side kept the prefix identical across calls and cut cost roughly 40%.
  The validation includes light normalisation, like enum spelling and numbers written with
  commas, and one retry.
- **Why verify quotes instead of trusting the model?** The brief said zero false positives on
  copied content. The model is good, but "good" isn't a guarantee. A deterministic check against
  the PDF text is. It also fixes page numbers when the model gets them off by one.
- **Why polling instead of websockets or SSE?** Processing takes one to three minutes, so uploads
  return a job id in milliseconds and the browser polls every two seconds. It's simpler to deploy
  behind nginx and the user experience is the same.
- **Why one Docker container and a VPS?** The brief requires 100 MB plus uploads. Serverless
  platforms and Cloudflare's free proxy reject bodies that size, so the upload streams straight
  to disk on a small VPS, hashed on the way in.
- **How do you protect your API key when reviewers test it?** Results are cached by file hash,
  so a repeat upload is free; there's a daily spend cap with a clear message; and the bundled
  samples have precomputed results.

## Numbers to have ready

- 5 plans labelled (559 items plus 32 decoys), 1 blind. Aggregate F1 90%; per category 88% to 93%;
  plan-by-category cells from 57% (Dry Creek goals, 4 items) to 100%; precision 93%.
- Numbers exact: 123 of 129 across the five plans. Zero decoys leaked.
- Cost: $0.62 to $1.50 per plan on Opus 5.5 ($4.45 for the final five-plan run). A 62 MB, 647-page
  plan uploads through nginx and parses in about 10 seconds on the 2 GB demo box.
- 39 unit tests, CI on every push, a smoke test of the built image before every deploy.

Final per-plan F1 (goals / BMPs / implementation / monitoring / outreach / areas):

| Plan                    | G   | B   | I   | M   | O   | A   |
| ----------------------- | --- | --- | --- | --- | --- | --- |
| Steele Bayou 2009       | 100 | 100 | 91  | 95  | 86  | 86  |
| Bell Creek 2012         | 85  | 100 | 84  | 83  | 88  | 87  |
| Dry Creek 2017          | 57  | 100 | 90  | 90  | 90  | 86  |
| Old Fort Bayou 2019     | 95  | 88  | 96  | 88  | 94  | 89  |
| Yazoo Pass 2021 (blind) | 86  | 100 | 95  | 92  | 82  | 94  |

## Questions they're likely to ask

- **"What was the hardest bug?"** Word tables. A long first cell wraps onto a second line, so
  "Chemical Oxygen" and "Demand | <50 mg/l" arrived as two rows. I fixed it by tracking column
  positions and folding a one-cell line back into its row. That one change recovered three
  monitoring thresholds on the blind plan.
- **"What are the limitations?"** No OCR, so scanned plans are refused with a clear message
  rather than guessed at. The verifier checks text, not meaning: a correctly quoted sentence
  filed under the wrong category passes verification, which is why categorisation accuracy is
  measured separately. And the labels are mine, so the blind plan is the honest check.
- **"What would you do with more time?"** Add OCR as an opt-in path, a second labeller to check
  my gold set, an OpenAI adapter behind the same provider interface, and a review mode where a
  human can accept or reject items and feed corrections back into the prompt examples.
- **"How did you use AI tools to build it?"** Claude Code for most of the code, with me deciding
  the architecture and verifying: unit tests for the deterministic parts, the accuracy harness
  for the model parts, and headless browser screenshots at desktop and phone widths for the UI.
  Be straightforward about this; they asked for it in the brief.

## Where things are

- Repo: github.com/jomardecastro/doc-extraction-tool (private). Demo: docextract.jdecastro.dev
  (Vultr 2 GB, `ssh docextract`, deploy with `ops/deploy.sh`).
- Assessment brief: `/mnt/e/Downloads/Document Extraction Tool - Technical Assessment.docx`.
- Deadline for the $800 tier: Monday 2026-10-26, 11:19 PM Manila.
- Pipeline design: `EXTRACTION_LOGIC.md`. Accuracy protocol: `TESTING.md`. Deploy: `DEPLOYMENT.md`.
