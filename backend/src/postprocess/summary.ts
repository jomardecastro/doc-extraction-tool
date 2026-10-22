import type { ExtractedReport, ReportSummary, Status } from "@det/shared";

type Parts = Pick<
  ExtractedReport,
  "goals" | "bmps" | "implementation" | "monitoring" | "outreach" | "geographicAreas"
>;

/**
 * The dashboard numbers. `completionRate` only counts items that carry a status; when nothing
 * does (common in plans written before implementation starts) the basis is "none" and the UI
 * says so instead of showing a misleading 0%.
 */
export function buildSummary(parts: Parts, droppedUnverified: number): ReportSummary {
  const statused: Status[] = [
    ...parts.bmps.map((b) => b.status),
    ...parts.implementation.map((a) => a.status),
  ].filter((s) => s !== "unknown");
  const completed = statused.filter((s) => s === "completed").length;
  const total = Object.values(parts).reduce((n, list) => n + list.length, 0);

  const byBmpCategory: Record<string, number> = {};
  for (const bmp of parts.bmps)
    byBmpCategory[bmp.category] = (byBmpCategory[bmp.category] ?? 0) + 1;
  const byStatus: Record<string, number> = {};
  for (const status of [
    ...parts.bmps.map((b) => b.status),
    ...parts.implementation.map((a) => a.status),
  ]) {
    byStatus[status] = (byStatus[status] ?? 0) + 1;
  }

  return {
    totalGoals: parts.goals.length,
    totalBMPs: parts.bmps.length,
    completionRate: statused.length > 0 ? round(completed / statused.length) : 0,
    completionRateBasis: statused.length > 0 ? "status" : "none",
    totalImplementation: parts.implementation.length,
    totalMonitoring: parts.monitoring.length,
    totalOutreach: parts.outreach.length,
    totalGeographicAreas: parts.geographicAreas.length,
    verifiedRate: total + droppedUnverified > 0 ? round(total / (total + droppedUnverified)) : 1,
    droppedUnverified,
    byBmpCategory,
    byStatus,
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
