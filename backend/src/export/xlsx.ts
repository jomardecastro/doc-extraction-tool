import ExcelJS from "exceljs";
import { CATEGORIES, CATEGORY_KEYS, CATEGORY_LABELS, type ExtractedReport } from "@det/shared";
import { COMMON_COLUMNS, EXTRA_COLUMNS, flattenReport } from "./csv.js";

/** A workbook with a summary sheet and one sheet per category, columns limited to what that category uses. */
export async function reportToXlsx(report: ExtractedReport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "DocExtract";

  const summary = wb.addWorksheet("Summary");
  summary.columns = [
    { header: "Field", key: "field", width: 28 },
    { header: "Value", key: "value", width: 60 },
  ];
  const s = report.summary;
  const d = report.document;
  for (const [field, value] of [
    ["Title", d.title],
    ["Plan year", d.planYear ?? ""],
    ["Plan family", d.planFamily],
    ["Watershed", d.watershedName ?? ""],
    ["HUC codes", d.hucCodes.join(", ")],
    ["Organizations", d.organizations.join("; ")],
    ["Pages", d.pages],
    ["Goals", s.totalGoals],
    ["BMPs", s.totalBMPs],
    ["Implementation activities", s.totalImplementation],
    ["Monitoring metrics", s.totalMonitoring],
    ["Outreach activities", s.totalOutreach],
    ["Geographic areas", s.totalGeographicAreas],
    [
      "Completion rate",
      s.completionRateBasis === "status"
        ? `${Math.round(s.completionRate * 100)}%`
        : "no status data",
    ],
    ["Verified rate", `${Math.round(s.verifiedRate * 100)}%`],
    ["Dropped (quote not found)", s.droppedUnverified],
    ["Model", report.run.model],
    ["Extracted at", report.run.startedAt],
  ] as const) {
    summary.addRow({ field, value });
  }
  summary.getRow(1).font = { bold: true };

  const rows = flattenReport(report);
  for (const category of CATEGORIES) {
    const items = rows.filter((r) => r.category === category);
    const used = EXTRA_COLUMNS.filter((c) =>
      items.some((r) => r[c] !== undefined && r[c] !== null && r[c] !== ""),
    );
    const columns = COMMON_COLUMNS.filter((c) => c !== "category").concat(used);
    const sheet = wb.addWorksheet(CATEGORY_LABELS[category].slice(0, 31));
    sheet.columns = columns.map((c) => ({
      header: c,
      key: c,
      width: c === "sourceQuote" || c === "description" ? 60 : 18,
    }));
    for (const row of items) sheet.addRow(row);
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    if (items.length === 0)
      sheet.addRow({ name: `No ${CATEGORY_LABELS[category].toLowerCase()} extracted` });
    void report[CATEGORY_KEYS[category]];
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
