import type { CategoryScore } from "./match.js";

export interface DocResult {
  doc: string;
  labelled: string;
  scores: CategoryScore[];
  droppedUnverified: number;
  verifiedRate: number;
  estimatedUsd: number;
  durationMs: number;
  model: string;
  cached: boolean;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function renderMarkdown(results: DocResult[], promptVersion: string): string {
  const lines: string[] = [];
  lines.push(`# Accuracy results`, ``, `Prompt version ${promptVersion}. Generated ${new Date().toISOString()}.`, ``);

  lines.push(`## Per document and category`, ``);
  lines.push(`| Document | Category | Gold | Pred | TP | Precision | Recall | F1 | Numbers | Types | Neg. leaked |`);
  lines.push(`|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|`);
  for (const r of results) {
    for (const s of r.scores) {
      const numbers = s.quantGold ? `${s.quantCorrect}/${s.quantGold}` : "-";
      const types = s.typeGold ? `${s.typeCorrect}/${s.typeGold}` : "-";
      lines.push(`| ${r.doc} | ${s.category} | ${s.gold} | ${s.predicted} | ${s.tp} | ${pct(s.precision)} | ${pct(s.recall)} | ${pct(s.f1)} | ${numbers} | ${types} | ${s.negativesLeaked} |`);
    }
  }

  lines.push(``, `## Aggregate by category (micro-averaged over documents)`, ``);
  lines.push(`| Category | Gold | Pred | Precision | Recall | F1 | Quantitative accuracy | Type accuracy |`);
  lines.push(`|---|---:|---:|---:|---:|---:|---:|---:|`);
  const categories = [...new Set(results.flatMap((r) => r.scores.map((s) => s.category)))];
  let allGold = 0;
  let allPred = 0;
  let allTp = 0;
  let allQuantGold = 0;
  let allQuantCorrect = 0;
  for (const category of categories) {
    const scores = results.flatMap((r) => r.scores.filter((s) => s.category === category));
    const gold = sum(scores, (s) => s.gold);
    const pred = sum(scores, (s) => s.predicted);
    const tp = sum(scores, (s) => s.tp);
    const qg = sum(scores, (s) => s.quantGold);
    const qc = sum(scores, (s) => s.quantCorrect);
    const tg = sum(scores, (s) => s.typeGold);
    const tc = sum(scores, (s) => s.typeCorrect);
    const p = pred ? tp / pred : 0;
    const rcl = gold ? tp / gold : 0;
    const f1 = p + rcl ? (2 * p * rcl) / (p + rcl) : 0;
    allGold += gold;
    allPred += pred;
    allTp += tp;
    allQuantGold += qg;
    allQuantCorrect += qc;
    lines.push(`| ${category} | ${gold} | ${pred} | ${pct(p)} | ${pct(rcl)} | ${pct(f1)} | ${qg ? `${pct(qc / qg)} (${qc}/${qg})` : "-"} | ${tg ? `${pct(tc / tg)} (${tc}/${tg})` : "-"} |`);
  }
  const P = allPred ? allTp / allPred : 0;
  const R = allGold ? allTp / allGold : 0;
  const F = P + R ? (2 * P * R) / (P + R) : 0;
  lines.push(`| **all** | ${allGold} | ${allPred} | ${pct(P)} | ${pct(R)} | ${pct(F)} | ${allQuantGold ? `${pct(allQuantCorrect / allQuantGold)} (${allQuantCorrect}/${allQuantGold})` : "-"} | |`);

  lines.push(``, `## Verification and cost`, ``);
  lines.push(`| Document | Labelled | Items dropped by verifier | Verified rate (post) | Model | Cost (USD) | Time |`);
  lines.push(`|---|---|---:|---:|---|---:|---:|`);
  for (const r of results) {
    lines.push(`| ${r.doc} | ${r.labelled} | ${r.droppedUnverified} | ${pct(r.verifiedRate)} | ${r.model}${r.cached ? " (cached)" : ""} | ${r.estimatedUsd.toFixed(2)} | ${(r.durationMs / 1000).toFixed(0)}s |`);
  }

  lines.push(``, `## Misses and extras`, ``);
  for (const r of results) {
    for (const s of r.scores) {
      if (s.misses.length === 0 && s.extras.length === 0) continue;
      lines.push(`### ${r.doc} / ${s.category}`, ``);
      if (s.misses.length) lines.push(`Missed (gold not found): ${s.misses.map((m) => `\`${m}\``).join(", ")}`, ``);
      if (s.extras.length) lines.push(`Extra (predicted, not in gold): ${s.extras.map((m) => `\`${m}\``).join(", ")}`, ``);
    }
  }
  return `${lines.join("\n")}\n`;
}

function sum<T>(items: T[], f: (t: T) => number): number {
  return items.reduce((n, t) => n + f(t), 0);
}
