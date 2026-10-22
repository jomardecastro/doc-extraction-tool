import { CATEGORIES, CATEGORY_KEYS, type ExtractedReport } from "@det/shared";

/**
 * One flat CSV for the whole report. Every row carries the common columns plus every
 * category-specific column (empty when not applicable), so the file opens cleanly in a
 * spreadsheet and can be filtered by the `category` column.
 */
export function reportToCsv(report: ExtractedReport): string {
  const rows = flattenReport(report);
  const columns = COMMON_COLUMNS.concat(
    EXTRA_COLUMNS.filter((c) =>
      rows.some((r) => r[c] !== undefined && r[c] !== null && r[c] !== ""),
    ),
  );
  const lines = [columns.join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c])).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

export type FlatRow = Record<string, string | number | boolean | null | undefined>;

export const COMMON_COLUMNS = [
  "category",
  "id",
  "name",
  "description",
  "page",
  "confidence",
  "verified",
  "sectionTitle",
  "sourceQuote",
];
export const EXTRA_COLUMNS = [
  "kind",
  "pollutants",
  "targetValue",
  "targetUnit",
  "targetText",
  "timeframe",
  "bmpCategory",
  "quantity",
  "unit",
  "estimatedCost",
  "targetPollutants",
  "expectedLoadReduction",
  "status",
  "location",
  "responsibleParty",
  "isMilestone",
  "relatedBmp",
  "cost",
  "metricType",
  "parameter",
  "value",
  "valueKind",
  "comparator",
  "frequency",
  "activityType",
  "audience",
  "count",
  "areaType",
  "hucCode",
  "areaValue",
  "areaUnit",
  "isPrimary",
];

export function flattenReport(report: ExtractedReport): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const category of CATEGORIES) {
    for (const item of report[CATEGORY_KEYS[category]] as Array<Record<string, unknown>>) {
      const row: FlatRow = { category };
      for (const [key, value] of Object.entries(item)) {
        const column = key === "category" ? "bmpCategory" : key;
        row[column] = flatten(value);
      }
      rows.push(row);
    }
  }
  return rows;
}

function flatten(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.join("; ");
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if ("value" in o && "unit" in o)
      return `${String(o.value)} ${String(o.unit)}${o.pollutant ? ` ${String(o.pollutant)}` : ""}`;
    return JSON.stringify(value);
  }
  return value as string | number | boolean;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
