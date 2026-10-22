/**
 * Text normalisation shared by the verifier and the deduplicator. The goal is to make "the same
 * words" compare equal across PDF extraction quirks (curly quotes, en dashes, non-breaking
 * spaces, line-wrap hyphens) without ever making different words compare equal.
 */

export function normalizeText(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Letters and digits only. Survives punctuation, spacing and hyphenation differences. */
export function squash(input: string): string {
  return normalizeText(input).replace(/[^a-z0-9]/g, "");
}

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "for",
  "to",
  "in",
  "on",
  "at",
  "by",
  "with",
  "from",
  "as",
  "is",
  "are",
  "be",
  "will",
  "shall",
  "this",
  "that",
  "these",
  "those",
  "its",
  "their",
]);

/** A comparison key for item names: lowercase, no punctuation or stopwords, simple plurals folded. */
export function nameKey(name: string): string {
  return normalizeText(name)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOPWORDS.has(w))
    .map(singular)
    .join(" ");
}

function singular(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (
    word.endsWith("ses") ||
    word.endsWith("xes") ||
    word.endsWith("ches") ||
    word.endsWith("shes")
  )
    return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/**
 * The ways a number can appear in text: 1200, 1,200, 1200.0, 1200.00, 1.2 (for 1.2), 35 and 35.0.
 * Used to check that an extracted value really is written in the quote.
 */
export function numberForms(value: number): string[] {
  const forms = new Set<string>();
  const abs = Math.abs(value);
  forms.add(String(abs));
  forms.add(abs.toLocaleString("en-US"));
  forms.add(abs.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  forms.add(abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  if (Number.isInteger(abs)) forms.add(abs.toFixed(0));
  else {
    forms.add(abs.toFixed(1));
    forms.add(abs.toFixed(2));
    forms.add(String(abs).replace(/^0\./, "."));
  }
  return [...forms];
}

export function containsNumber(haystack: string, value: number): boolean {
  const text = normalizeText(haystack);
  return numberForms(value).some((form) => {
    // Match at a token boundary so 25 does not match 250 or 1,250.
    const re = new RegExp(`(^|[^0-9.,])${escapeRegExp(form)}(?![0-9])`);
    return re.test(text);
  });
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
