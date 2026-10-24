# Testing

Two kinds of tests: unit tests for the deterministic parts (layout reconstruction, cleaning,
verification, dedupe, summary, JSON handling) and an accuracy harness that scores the whole
pipeline against hand-labelled plans. The harness is the one that matters for the assessment's
accuracy requirements, so most of this document is about it.

## Accuracy harness

```bash
pnpm eval:fetch            # downloads the labelled plans from MDEQ into eval/docs/ (not committed)
pnpm eval                  # runs every labelled plan and writes eval/results/latest.md
pnpm eval --doc steele_bayou_2009          # one plan
pnpm eval --no-llm-cache                   # ignore stored results (re-bills the model)
pnpm eval --draft <slug>                   # write eval/gold/<slug>.draft.json to correct by hand
```

Reports are cached by content hash, model and prompt version, so re-scoring after a change to
the gold set or the matcher is free and instant; a change to the prompt re-runs the model.

### Documents

Five Mississippi watershed plans chosen to cover both families and the size range. A sixth
file, Buttahatchee River 2004 (18 MB), is a scanned PDF with no text layer; it is used to test
the "no readable text" error path, not accuracy. Ross Barnett Reservoir 2011 (62 MB, 647 pages)
is used for the large-file tests below.

| Plan                                                | Family                       | Pages |   Size | Labelling                                                                                                   |
| --------------------------------------------------- | ---------------------------- | ----: | -----: | ----------------------------------------------------------------------------------------------------------- |
| Yazoo Pass 9 Key Element Plan (2021)                | nine-element                 |    14 | 1.2 MB | **blind**: labelled from the cleaned text before any model output was seen                                  |
| Dry Creek 9 Key Element Plan (2017)                 | nine-element                 |    12 | 1.0 MB | corrected: the model's draft checked line by line against the text, wrong items removed, missed items added |
| Steele Bayou Watershed Implementation Plan (2009)   | narrative                    |    27 | 0.3 MB | corrected                                                                                                   |
| Bell Creek-West Prong Muddy Creek WIP (2012)        | narrative, double-spaced     |    53 | 1.8 MB | corrected                                                                                                   |
| Old Fort Bayou Watershed Implementation Plan (2019) | narrative, numbered sections |    66 | 4.0 MB | corrected (see note)                                                                                        |

Gold files live in `eval/gold/`; their format and the labelling rules are in
`eval/gold/README.md`. The labeller was the developer, so the labels carry the same reading
of the documents as the prompt; the blind plan is the honest check on that.

### What is measured

For each plan and category, `eval/match.ts` matches gold items to predicted items greedily by
name similarity (stemmed token overlap, or one name containing the other) within two pages,
with a secondary signal from the predicted item's verbatim quote (the gold name's content
words present in the quote). From the matches:

- **Precision, recall, F1** per category. The assessment's "≥ 75% accuracy in identifying main
  goals, BMPs and activities" is read as F1 ≥ 75% per category.
- **Quantitative accuracy**: among matched items where the gold states a number, the share whose
  predicted value (and unit, when the gold gives one) is exactly right. BMP costs are checked
  as well as quantities.
- **Type accuracy**: among matched items where the gold states a category enum (BMP type,
  monitoring value kind, outreach type, area type), the share classified the same way.
- **Negatives leaked**: text that looks like an item but must not be extracted (definitions,
  examples, boilerplate), listed per plan; counted when a prediction's quote contains it.
- **Post-validator false positives**: the share of returned items whose quote is _not_ found
  verbatim in the PDF. By construction this is 0 after verification (the verifier drops such
  items); the number of items it dropped is reported so the model's raw rate is visible too.

"Extras" (predictions with no gold match) are listed in the report. Several of them on every
plan are real statements the labeller had not listed; they are left as counted misses rather
than added after the fact, except where noted.

### Results

Final run: `claude-opus-5-5`, effort `high`, prompt version `2026-10-23.5`, five plans, 559 gold items and 32 negatives, generated 2026-10-24. Every category clears the 75% bar on the aggregate; four of the five plans clear it in every category individually.

**Aggregate by category** (micro-averaged over the five plans)

| Category       | Gold | Pred | Precision | Recall |  F1 | Quantitative accuracy | Type accuracy |
| -------------- | ---: | ---: | --------: | -----: | --: | --------------------: | ------------: |
| goals          |   55 |   53 |       92% |    89% | 91% |            100% (2/2) |   95% (38/40) |
| bmps           |   90 |   79 |      100% |    88% | 93% |          100% (53/53) |   99% (74/75) |
| implementation |  142 |  138 |       91% |    89% | 90% |            100% (2/2) |             - |
| monitoring     |  126 |  110 |       95% |    83% | 89% |           92% (49/53) |   99% (74/75) |
| outreach       |   75 |   79 |       87% |    92% | 90% |             88% (7/8) |  100% (58/58) |
| geographic     |   71 |   65 |       92% |    85% | 88% |           91% (10/11) |   92% (49/53) |
| **all**        |  559 |  524 |       93% |    87% | 90% |         95% (123/129) |               |

**F1 per plan**

| Plan                        | Goals | BMPs | Implementation | Monitoring | Outreach | Geographic |
| --------------------------- | ----: | ---: | -------------: | ---------: | -------: | ---------: |
| Steele Bayou 2009           |  100% | 100% |            91% |        95% |      86% |        86% |
| Bell Creek-Muddy Creek 2012 |   85% | 100% |            84% |        83% |      88% |        87% |
| Dry Creek 9KE 2017          |   57% | 100% |            90% |        90% |      90% |        86% |
| Old Fort Bayou 2019         |   95% |  88% |            96% |        88% |      94% |        89% |
| Yazoo Pass 9KE 2021         |   86% | 100% |            95% |        92% |      82% |        94% |

**Verification, false positives and cost**

| Document                    | Labelled  | Items dropped by verifier | Verified rate (post) | Model                    | Cost (USD) | Time |
| --------------------------- | --------- | ------------------------: | -------------------: | ------------------------ | ---------: | ---: |
| bell_creek_muddy_creek_2012 | corrected |                         0 |                 100% | claude-opus-5-5 (cached) |       0.92 | 129s |
| dry_creek_9ke_2017          | corrected |                         1 |                  99% | claude-opus-5-5 (cached) |       0.62 |  87s |
| old_fort_bayou_2019         | corrected |                         3 |                  98% | claude-opus-5-5 (cached) |       1.50 | 193s |
| steele_bayou_2009           | corrected |                         0 |                 100% | claude-opus-5-5 (cached) |       0.68 | 106s |
| yazoo_pass_9ke_2021         | blind     |                         3 |                  97% | claude-opus-5-5 (cached) |       0.73 |  97s |

"Items dropped by verifier" is the number of returned items whose quote was not found verbatim in the PDF text and were therefore removed before the report was built; the post-validator false-positive rate is 0 by construction, and none of the 32 labelled negatives leaked into any result. Opus 5.5 with the shared cached document prefix costs between $0.62 (12 pages) and $1.50 (66 pages) per plan and takes one and a half to three minutes.

The one cell under 75% is Dry Creek goals (F1 57%): the plan states four goals, the model returned three, and one of its three ("Attain the M-BISQ threshold for the East bioregion") is the gold's "Attainment of the Aquatic Life Designated Use" expressed through its metric, which the fuzzy matcher does not join. With four items a single miss costs 25 points; the aggregate goals F1 across 55 gold items is 91%.

The full per-plan table, misses and extras are in `eval/results/latest.md`.

### Notes from reading the misses

- **Old Fort Bayou (66 pages) recall.** Its BMP recall (78%) comes from Section 3.1.1, where the plan
  lists the practices its conservation partners and a golf course already run (prescribed burns,
  invasive species management, vernal pond management, bird and bat houses). The gold labels every
  practice the plan calls a BMP; the model returned the water-quality ones and skipped the habitat
  ones. Monitoring recall (78%) is the student pH readings and three recommended studies the model
  folded into neighbouring items. Precision on that plan is 95-100% in every category.
- **Page-choice artefacts.** Two Old Fort misses are the same statement on two pages: the 35% TMDL
  reduction (gold p.12, the goals section; model p.46, the management section) and the Plastic Free
  restaurant programme (gold p.60, the outreach plan; model p.41, the assessment). The two-page
  window counts them as misses; the labels were not moved after seeing the output.

- **Cross-listed statements.** The older plans list milestones ("erect 20 roadside signs",
  "hold two field days") that are both implementation milestones and outreach activities. The
  model tends to file each in one category; the gold lists them in both. Prompt rule 10 now
  says the categories are independent.
- **Main text vs appendix.** When the funded-proposal appendix restates a figure from the main
  text (the 45-70% nutrient reduction, the watershed acreage), the model sometimes quoted the
  appendix; the gold points at the main text and the two-page window counts it as a miss.
  Prompt rule 8 now prefers the main text.
- **Restated goals as monitoring targets.** "Reduce sediment by 35%" appeared as both a goal
  and a monitoring target. The monitoring instructions now exclude restated goals unless the
  document presents the figure as a progress criterion.
- **Table cells that wrap.** "Chemical Oxygen / Demand | <50 mg/l" was two rows until the
  layout step learned to fold a wrapped first cell into the next row; the three threshold rows
  it affected were the only monitoring numbers missed on the blind plan.

## Unit tests

`pnpm test` (vitest, `backend/test/`):

| File                | Covers                                                                                                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout.test.ts`    | headings by size, font resource and numbering; paragraph joining and hyphenation; double-spaced paragraphs; bullets vs numbered headings; superscripts; table detection with wrapped cells; captions |
| `clean.test.ts`     | running headers/footers and page numbers; cover, contents and reference material; appendix labelling; contact lines                                                                                  |
| `verify.test.ts`    | quote found, page corrected, table separators and dashes forgiven, quote not found (dropped), number not in source (nulled), nested numbers, name not on page (downgraded)                           |
| `dedupe.test.ts`    | merge by name key, fill nulls, union lists, keep higher confidence                                                                                                                                   |
| `summary.test.ts`   | completion rate and its basis, counts, verified rate                                                                                                                                                 |
| `normalize.test.ts` | text normalisation, name keys, number forms and boundaries                                                                                                                                           |
| `json.test.ts`      | JSON extraction from prose, schema normalisation, enum fallbacks, prompt schema rendering                                                                                                            |

## Large files, errors and the live demo

Checked by hand against the deployed server and the local Docker image:

- 62 MB / 647-page PDF: upload streams in under a second, text extraction takes about 5 s,
  the container peaks around 700 MB.
- Scanned PDF (Buttahatchee 2004): refused with "This PDF has no readable text" within seconds.
- A non-PDF file: refused with "Only PDF files are accepted" before anything is stored.
- Re-uploading a processed file: answered from the result cache with no model call.
- Daily budget cap: new uploads refused with a clear message once the cap is reached;
  precomputed samples still open.
- `LLM_PROVIDER=mock`: the whole app runs without an API key, clearly labelled.

`ops/deploy.sh` runs typecheck, lint, unit tests and a mock-provider smoke test of the built
image (health, frontend, samples, one extraction) before anything is shipped.
