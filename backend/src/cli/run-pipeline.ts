/**
 * Runs the full extraction on one PDF from the command line.
 *
 *   pnpm run-pipeline <file.pdf> [--provider mock] [--model claude-sonnet-5-5] [--no-cache] [--out report.json]
 *
 * Reads .env for the API key. Progress and a summary go to stderr; the report JSON goes to
 * --out or stdout. `--no-cache` ignores a stored result (the parsed text is still reused).
 */
import { readFile, writeFile } from "node:fs/promises";
import { CATEGORIES, CATEGORY_KEYS } from "@det/shared";
import { loadConfig, loadDotEnv } from "../config.js";
import { createProvider } from "../llm/index.js";
import { runPipeline, sha256 } from "../jobs/pipeline.js";
import { AppError } from "../errors.js";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error(
    "usage: run-pipeline <file.pdf> [--provider mock] [--model id] [--no-cache] [--out report.json]",
  );
  process.exit(2);
}
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

loadDotEnv();
const env: NodeJS.ProcessEnv = { ...process.env };
if (flag("--provider")) env.LLM_PROVIDER = flag("--provider");
if (flag("--model")) env.LLM_MODEL = flag("--model");
env.DATA_DIR ??= "../data";
const config = loadConfig(env);
const provider = createProvider(config);

const data = new Uint8Array(await readFile(file));
const t0 = Date.now();
let lastStage = "";
try {
  const { report, cached } = await runPipeline(
    { data, filename: file.split("/").pop()!, sha256: sha256(data) },
    { provider, config, log: (m, d) => console.error(`  ${m} ${d ? JSON.stringify(d) : ""}`) },
    {
      useResultCache: !args.includes("--no-cache"),
      onProgress: (p) => {
        if (p.stage !== lastStage) {
          console.error(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${p.stage}`);
          lastStage = p.stage;
        }
      },
    },
  );

  const out = flag("--out");
  const json = JSON.stringify(report, null, 2);
  if (out) await writeFile(out, json);
  else process.stdout.write(`${json}\n`);

  const r = report.run;
  console.error(
    `\n${report.document.title} (${report.document.planYear ?? "?"}, ${report.document.planFamily}) ${cached ? "[cached]" : ""}`,
  );
  for (const c of CATEGORIES)
    console.error(`  ${c.padEnd(15)} ${String(report[CATEGORY_KEYS[c]].length).padStart(3)}`);
  console.error(
    `  verified ${Math.round(report.summary.verifiedRate * 100)}%, dropped ${report.summary.droppedUnverified}, partial [${r.partialCategories.join(",")}]`,
  );
  console.error(
    `  ${r.model}: in ${r.inputTokens} / cache read ${r.cacheReadTokens} / cache write ${r.cacheWriteTokens} / out ${r.outputTokens} tokens, $${r.estimatedUsd.toFixed(3)}, ${(r.durationMs / 1000).toFixed(1)}s`,
  );
} catch (err) {
  if (err instanceof AppError) console.error(`\nFAILED ${err.code}: ${err.message}`);
  else console.error(err);
  process.exit(1);
}
