import type { Confidence } from "@det/shared";
import { nameKey } from "./normalize.js";

const RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

/**
 * Merges items that name the same thing ("Water Control Structures" / "water control structure").
 * The higher-confidence item wins; null fields are filled from the duplicate and list fields are
 * unioned, so a practice mentioned once with a quantity and once with a cost ends up with both.
 */
export function dedupeItems<T extends { name: string; confidence: Confidence }>(items: T[]): { items: T[]; merged: number } {
  const byKey = new Map<string, T>();
  let merged = 0;
  for (const item of items) {
    const key = nameKey(item.name);
    if (key.length === 0) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...item });
      continue;
    }
    merged++;
    const [winner, loser] = RANK[item.confidence] > RANK[existing.confidence] ? [{ ...item }, existing] : [existing, item];
    fillFrom(winner as Record<string, unknown>, loser as Record<string, unknown>);
    byKey.set(key, winner);
  }
  return { items: [...byKey.values()], merged };
}

function fillFrom(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    const current = target[key];
    if (Array.isArray(current) && Array.isArray(value)) {
      target[key] = [...new Set([...current, ...value])];
    } else if ((current === null || current === undefined || current === "") && value !== null && value !== undefined) {
      target[key] = value;
    }
  }
}
