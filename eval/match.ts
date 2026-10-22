import type { Category } from "@det/shared";
import { CATEGORY_KEYS, type ExtractedReport } from "@det/shared";
import { nameKey, normalizeText } from "../backend/src/postprocess/normalize.js";

/**
 * Scoring for the accuracy harness.
 *
 * Gold items and predicted items are matched greedily by name similarity within a page window.
 * Matching on names rather than quotes keeps the gold set independent of how the model phrases
 * its provenance, which is what we want to measure: did the tool find the thing, on the page it
 * is stated, with the number the document gives.
 */

export interface GoldItem {
  name: string;
  page: number;
  value?: number | null;
  unit?: string | null;
  cost?: number | null;
  type?: string | null;
}

export interface GoldNegative {
  category: Category;
  page: number;
  text: string;
}

export interface GoldDocument {
  doc: string;
  labelled: "blind" | "corrected";
  goals: GoldItem[];
  bmps: GoldItem[];
  implementation: GoldItem[];
  monitoring: GoldItem[];
  outreach: GoldItem[];
  geographic: GoldItem[];
  negatives?: GoldNegative[];
}

export interface CategoryScore {
  category: Category;
  gold: number;
  predicted: number;
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
  /** Matched pairs where gold states a number: how many the prediction got exactly right. */
  quantGold: number;
  quantCorrect: number;
  /** Matched pairs where gold states a type: how many the prediction classified the same way. */
  typeGold: number;
  typeCorrect: number;
  negativesLeaked: number;
  misses: string[];
  extras: string[];
}

const PAGE_WINDOW = 2;

/** Predicted fields that hold the comparable number / type per category. */
const VALUE_FIELD: Record<Category, string> = {
  goals: "targetValue",
  bmps: "quantity",
  implementation: "cost",
  monitoring: "value",
  outreach: "count",
  geographic: "areaValue",
};
const UNIT_FIELD: Record<Category, string | null> = {
  goals: "targetUnit",
  bmps: "unit",
  implementation: null,
  monitoring: "unit",
  outreach: null,
  geographic: "areaUnit",
};
const TYPE_FIELD: Record<Category, string | null> = {
  goals: "kind",
  bmps: "category",
  implementation: null,
  monitoring: "valueKind",
  outreach: "activityType",
  geographic: "areaType",
};

type Predicted = Record<string, unknown> & { name: string; page: number; sourceQuote: string };

export function scoreCategory(category: Category, gold: GoldItem[], report: ExtractedReport, negatives: GoldNegative[] = []): CategoryScore {
  const predicted = report[CATEGORY_KEYS[category]] as unknown as Predicted[];
  const used = new Set<number>();
  let tp = 0;
  let quantGold = 0;
  let quantCorrect = 0;
  let typeGold = 0;
  let typeCorrect = 0;
  const misses: string[] = [];

  for (const g of gold) {
    let best = -1;
    let bestScore = 0;
    predicted.forEach((p, i) => {
      if (used.has(i) || Math.abs(p.page - g.page) > PAGE_WINDOW) return;
      const s = similarity(g.name, p.name);
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    });
    if (best < 0 || bestScore < 0.5) {
      misses.push(`${g.name} (p.${g.page})`);
      continue;
    }
    used.add(best);
    tp++;
    const p = predicted[best]!;
    if (typeof g.value === "number") {
      quantGold++;
      const value = p[VALUE_FIELD[category]];
      const unitField = UNIT_FIELD[category];
      const unitOk = !unitField || !g.unit || sameUnit(g.unit, p[unitField] as string | null);
      if (typeof value === "number" && closeEnough(value, g.value) && unitOk) quantCorrect++;
      else if (category === "bmps" && typeof g.cost === "number" && closeEnough(p.estimatedCost as number, g.cost)) quantCorrect++;
    } else if (category === "bmps" && typeof g.cost === "number") {
      quantGold++;
      if (typeof p.estimatedCost === "number" && closeEnough(p.estimatedCost, g.cost)) quantCorrect++;
    }
    if (g.type) {
      const typeField = TYPE_FIELD[category];
      if (typeField) {
        typeGold++;
        if (p[typeField] === g.type) typeCorrect++;
      }
    }
  }

  const extras = predicted.filter((_, i) => !used.has(i)).map((p) => `${p.name} (p.${p.page})`);
  const fp = predicted.length - tp;
  const fn = gold.length - tp;
  const precision = predicted.length > 0 ? tp / predicted.length : gold.length === 0 ? 1 : 0;
  const recall = gold.length > 0 ? tp / gold.length : 1;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  const negativesLeaked = negatives
    .filter((n) => n.category === category)
    .filter((n) => predicted.some((p) => normalizeText(p.sourceQuote).includes(normalizeText(n.text)) || normalizeText(p.name).includes(normalizeText(n.text)))).length;

  return { category, gold: gold.length, predicted: predicted.length, tp, fp, fn, precision, recall, f1, quantGold, quantCorrect, typeGold, typeCorrect, negativesLeaked, misses, extras };
}

/** 1 when one name key contains the other, otherwise the token Jaccard index. */
export function similarity(a: string, b: string): number {
  const ka = nameKey(a);
  const kb = nameKey(b);
  if (ka.length === 0 || kb.length === 0) return 0;
  if (ka === kb || ka.includes(kb) || kb.includes(ka)) return 1;
  const ta = new Set(ka.split(" "));
  const tb = new Set(kb.split(" "));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

function closeEnough(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(0.005 * Math.abs(b), 1e-9);
}

const UNIT_SYNONYMS: string[][] = [
  ["units", "unit", "#", "each", "ea", "number", "count"],
  ["feet", "ft", "linear feet", "linear ft", "lf"],
  ["acres", "ac", "acre"],
  ["%", "percent"],
  ["mg/l", "mg/L", "milligrams per liter"],
  ["miles", "mi"],
  ["$", "usd", "dollars"],
];

function sameUnit(a: string, b: string | null): boolean {
  if (!b) return false;
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (na === nb) return true;
  return UNIT_SYNONYMS.some((group) => group.includes(na) && group.includes(nb));
}
