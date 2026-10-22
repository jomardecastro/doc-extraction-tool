export interface RecentDocument {
  id: string;
  filename: string;
  at: string;
}

const KEY = "docextract.recent";
const MAX = 8;

/** Per-browser convenience list. Storage can be blocked (private mode), so every call is guarded. */
export function readRecent(): RecentDocument[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as RecentDocument[]) : [];
    return Array.isArray(parsed) ? parsed.filter((r) => r && typeof r.id === "string") : [];
  } catch {
    return [];
  }
}

export function rememberRecent(doc: RecentDocument): void {
  try {
    const list = [doc, ...readRecent().filter((r) => r.id !== doc.id)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage unavailable; the list is a convenience, not state
  }
}

export function forgetRecent(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(readRecent().filter((r) => r.id !== id)));
  } catch {
    // ignore
  }
}
