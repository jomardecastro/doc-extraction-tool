/**
 * Accuracy harness: runs the pipeline on the labelled documents and scores the output.
 *
 *   pnpm eval                          every document with a gold file
 *   pnpm eval --doc steele_bayou_2009  one document (repeatable)
 *   pnpm eval --no-llm-cache           ignore stored results (re-bill the model)
 *   pnpm eval --model claude-sonnet-5-5 --provider anthropic|mock
 *   pnpm eval --draft yazoo_pass_9ke_2021   write eval/gold/<slug>.draft.json to correct by hand
 *
 * Writes eval/results/<timestamp>.json and eval/results/latest.md. Reads .env for the API key.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORIES, CATEGORY_KEYS, type Category, type ExtractedReport } from "@det/shared";
import { loadConfig, loadDotEnv } from "../backend/src/config.js";
import { createProvider } from "../backend/src/llm/index.js";
import { PROMPT_VERSION } from "../backend/src/llm/prompts/system.js";
import { runPipeline, sha256 } from "../backend/src/jobs/pipeline.js";
import { scoreCategory, type GoldDocument, type GoldItem } from "./match.js";
import { renderMarkdown, type DocResult } from "./report.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flagValues = (name: string) => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]!] : []));
const flag = (name: string) => flagValues(name)[0];

loadDotEnv();
const env: NodeJS.ProcessEnv = { ...process.env };
if (flag("--provider")) env.LLM_PROVIDER = flag("--provider");
if (flag("--model")) env.LLM_MODEL = flag("--model");
env.DATA_DIR ??= path.join(here, "..", "data");
const config = loadConfig(env);
const provider = createProvider(config);

const draftSlug = flag("--draft");
const slugs = draftSlug ? [draftSlug] : flagValues("--doc").length ? flagValues("--doc") : await goldSlugs();
if (slugs.length === 0) {
  console.error("no gold files in eval/gold; label one first (see eval/gold/README.md)");
  process.exit(2);
}

const results: DocResult[] = [];
for (const slug of slugs) {
  const pdf = path.join(here, "docs", `${slug}.pdf`);
  if (!existsSync(pdf)) {
    console.error(`missing ${pdf}; run pnpm eval:fetch`);
    process.exit(2);
  }
  console.error(`\n== ${slug}`);
  const data = new Uint8Array(await readFile(pdf));
  const t0 = Date.now();
  const { report, cached } = await runPipeline(
    { data, filename: `${slug}.pdf`, sha256: sha256(data) },
    { provider, config, log: (m, d) => console.error(`   ${m} ${d ? JSON.stringify(d) : ""}`) },
    { useResultCache: !args.includes("--no-llm-cache") },
  );
  console.error(`   ${cached ? "cached" : "fresh"} in ${((Date.now() - t0) / 1000).toFixed(1)}s, $${report.run.estimatedUsd.toFixed(3)}`);

  if (draftSlug) {
    const draft = toDraft(slug, report);
    const file = path.join(here, "gold", `${slug}.draft.json`);
    await writeFile(file, `${JSON.stringify(draft, null, 2)}\n`);
    console.error(`   draft written to ${file}`);
    continue;
  }

  const gold = JSON.parse(await readFile(path.join(here, "gold", `${slug}.json`), "utf8")) as GoldDocument;
  const scores = CATEGORIES.map((c) => scoreCategory(c, gold[c] ?? [], report, gold.negatives ?? []));
  for (const s of scores) {
    console.error(`   ${s.category.padEnd(15)} gold ${String(s.gold).padStart(3)} pred ${String(s.predicted).padStart(3)}  P ${pct(s.precision)} R ${pct(s.recall)} F1 ${pct(s.f1)}${s.quantGold ? `  numbers ${s.quantCorrect}/${s.quantGold}` : ""}`);
  }
  results.push({
    doc: slug,
    labelled: gold.labelled,
    scores,
    droppedUnverified: report.summary.droppedUnverified,
    verifiedRate: report.summary.verifiedRate,
    estimatedUsd: report.run.estimatedUsd,
    durationMs: report.run.durationMs,
    model: report.run.model,
    cached,
  });
}

if (!draftSlug) {
  const markdown = renderMarkdown(results, PROMPT_VERSION);
  const resultsDir = path.join(here, "results");
  await mkdir(resultsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await writeFile(path.join(resultsDir, `${stamp}.json`), JSON.stringify({ promptVersion: PROMPT_VERSION, model: provider.model, results }, null, 2));
  await writeFile(path.join(resultsDir, "latest.md"), markdown);
  console.error(`\nwrote eval/results/latest.md`);
  process.stdout.write(markdown);
}

async function goldSlugs(): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const dir = path.join(here, "gold");
  if (!existsSync(dir)) return [];
  return (await readdir(dir)).filter((f) => f.endsWith(".json") && !f.endsWith(".draft.json")).map((f) => f.replace(/\.json$/, ""));
}

function toDraft(slug: string, report: ExtractedReport): GoldDocument {
  const pick = (category: Category): GoldItem[] =>
    (report[CATEGORY_KEYS[category]] as Array<Record<string, unknown>>).map((item) => {
      const g: GoldItem = { name: String(item.name), page: Number(item.page) };
      const value = item.targetValue ?? item.quantity ?? item.value ?? item.count ?? item.areaValue ?? item.cost;
      const unit = item.targetUnit ?? item.unit ?? item.areaUnit;
      if (typeof value === "number") g.value = value;
      if (typeof unit === "string") g.unit = unit;
      if (category === "bmps" && typeof item.estimatedCost === "number") g.cost = item.estimatedCost;
      const type = category === "bmps" ? item.category : category === "monitoring" ? item.valueKind : category === "outreach" ? item.activityType : category === "geographic" ? item.areaType : category === "goals" ? item.kind : null;
      if (typeof type === "string") g.type = type;
      return g;
    });
  return {
    doc: slug,
    labelled: "corrected",
    goals: pick("goals"),
    bmps: pick("bmps"),
    implementation: pick("implementation"),
    monitoring: pick("monitoring"),
    outreach: pick("outreach"),
    geographic: pick("geographic"),
    negatives: [],
  };
}

function pct(n: number): string {
  return `${String(Math.round(n * 100)).padStart(3)}%`;
}
