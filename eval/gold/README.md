# Gold set

One JSON file per evaluation document, named after the slug in `eval/fetch.mjs`
(`steele_bayou_2009.json` for `eval/docs/steele_bayou_2009.pdf`).

```jsonc
{
  "doc": "steele_bayou_2009",
  "labelled": "blind", // "blind": labelled from the PDF text before seeing model output
  // "corrected": the model's draft was corrected by hand
  "goals": [{ "name": "Achieve compliance with TMDLs", "page": 15 }],
  "bmps": [
    {
      "name": "Water Control Structures",
      "page": 17,
      "value": 25,
      "unit": "units",
      "cost": 37500,
      "type": "structural",
    },
  ],
  "implementation": [{ "name": "...", "page": 9 }],
  "monitoring": [
    {
      "name": "Dissolved oxygen daily average",
      "page": 12,
      "value": 5.0,
      "unit": "mg/L",
      "type": "threshold",
    },
  ],
  "outreach": [{ "name": "Teacher workshops", "page": 9, "type": "workshop" }],
  "geographic": [
    {
      "name": "Steele Bayou Watershed",
      "page": 6,
      "value": 202617,
      "unit": "acres",
      "type": "watershed",
    },
  ],
  "negatives": [
    // text that looks like an item but must NOT be extracted (definitions, examples, boilerplate)
    { "category": "bmps", "page": 3, "text": "EPA defines a BMP as" },
  ],
}
```

Rules used when labelling:

- `name` is a short canonical phrase in the document's own words, not a quote. Matching is
  fuzzy (see `eval/match.ts`), so capitalisation and plurals do not matter.
- `page` is the PDF page the item is stated on. A match tolerates two pages of drift.
- `value`/`unit` are given only when the document states a number for the item; `cost` for BMPs.
- `type` is the category enum the item should get (BMP category, monitoring valueKind,
  outreach activityType, geographic areaType); optional.
- One entry per distinct thing, following the same rules the prompt gives the model.
- Appendix content that repeats the main text is not labelled twice.

`pnpm eval --draft <slug>` writes `eval/gold/<slug>.draft.json` from a pipeline run; copy it to
`<slug>.json`, correct it, and set `labelled` to `"corrected"`.
