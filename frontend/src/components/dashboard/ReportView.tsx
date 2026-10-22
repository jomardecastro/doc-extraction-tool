import { useState } from "react";
import { CATEGORIES, CATEGORY_KEYS, CATEGORY_LABELS, type Category, type ExtractedReport, type JobView } from "@det/shared";
import { exportUrl } from "../../api/client.js";
import { formatDuration, formatNumber, pct } from "../../lib/format.js";
import { Badge, Icon } from "../ui.js";
import { BmpCategoryChart, ItemsByPageChart, ItemsPerCategoryChart, StatusChart } from "./Charts.js";
import { ItemTable } from "./ItemTable.js";

const FAMILY: Record<ExtractedReport["document"]["planFamily"], string> = { watershed_plan: "Watershed plan", nine_element: "9 Key Element plan", other: "Plan" };

/**
 * The dashboard. One primary number (items extracted, all quote-verified), six secondary
 * counts, three charts, then the six category tables. The export menu is the only floating
 * surface on the page.
 */
export function ReportView({ job, report }: { job: JobView; report: ExtractedReport }) {
  const [tab, setTab] = useState<Category>("goals");
  const total = CATEGORIES.reduce((n, c) => n + report[CATEGORY_KEYS[c]].length, 0);
  const d = report.document;
  const s = report.summary;
  const partial = report.run.partialCategories;

  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{FAMILY[d.planFamily]}</Badge>
            {d.planYear && <Badge>{d.planYear}</Badge>}
            {job.cached && <Badge>stored result</Badge>}
          </div>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">{d.title}</h1>
          <p className="mt-1 text-sm text-ink-2">
            {d.watershedName ? `${d.watershedName} · ` : ""}
            <span className="num">{d.pages} pages</span>
            {d.administrativePages > 0 && <span className="num"> ({d.administrativePages} front-matter pages skipped)</span>}
            {d.hucCodes.length > 0 && <span className="num"> · HUC {d.hucCodes.join(", ")}</span>}
          </p>
        </div>
        <ExportMenu jobId={job.id} />
      </header>

      {partial.length > 0 && (
        <div className="mt-4 flex items-start gap-3 rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm" role="status">
          <span className="mt-0.5 text-danger">
            <Icon.Alert />
          </span>
          <p>
            The model call for {partial.map((c) => CATEGORY_LABELS[c].toLowerCase()).join(", ")} failed, so {partial.length === 1 ? "that category is" : "those categories are"} empty. The rest of the report is complete; re-run live to try again.
          </p>
        </div>
      )}

      <section className="mt-6 grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="rounded-lg border border-line bg-surface p-5">
          <p className="text-sm text-ink-2">Items extracted</p>
          <p className="num mt-1 text-2xl font-semibold tracking-tight whitespace-nowrap">{formatNumber(total)}</p>
          <p className="num mt-1 text-sm text-ink-2">
            {pct(s.verifiedRate)} quote-verified
            {s.droppedUnverified > 0 ? ` · ${s.droppedUnverified} dropped (quote not found in the PDF)` : " · nothing dropped"}
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-x-4 gap-y-3 rounded-lg border border-line bg-surface p-5 sm:grid-cols-4">
          {CATEGORIES.map((c) => (
            <div key={c}>
              <dt className="text-sm text-ink-2">{CATEGORY_LABELS[c]}</dt>
              <dd className="num text-lg font-semibold">{report[CATEGORY_KEYS[c]].length}</dd>
            </div>
          ))}
          <div>
            <dt className="text-sm text-ink-2">Completion</dt>
            <dd className="num text-lg font-semibold">{s.completionRateBasis === "status" ? pct(s.completionRate) : <span className="text-base font-normal text-ink-3">no status data</span>}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-2">Numbers captured</dt>
            <dd className="num text-lg font-semibold">{countNumbers(report)}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-4 grid gap-4 md:grid-cols-2">
        <ItemsPerCategoryChart report={report} />
        <BmpCategoryChart report={report} />
        <StatusChart report={report} />
        <ItemsByPageChart report={report} className={s.completionRateBasis === "status" ? "" : "md:col-span-2"} />
      </section>

      <section className="mt-8">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div role="tablist" aria-label="Categories" className="flex min-w-max gap-1 border-b border-line">
            {CATEGORIES.map((c) => {
              const active = tab === c;
              return (
                <button
                  key={c}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => setTab(c)}
                  className={`btn -mb-px rounded-none border-b-2 px-3 py-2 text-base ${active ? "border-accent font-semibold text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
                >
                  {CATEGORY_LABELS[c]} <span className="num ml-1 text-sm text-ink-3">{report[CATEGORY_KEYS[c]].length}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div role="tabpanel" className="mt-4">
          <ItemTable key={tab} category={tab} items={report[CATEGORY_KEYS[tab]]} />
        </div>
      </section>

      <p className="num mt-8 text-sm text-ink-3">
        Extracted with {report.run.model} in {formatDuration(report.run.durationMs)} · {formatNumber(report.run.inputTokens + report.run.cacheReadTokens + report.run.cacheWriteTokens)} input tokens ({formatNumber(report.run.cacheReadTokens)} from cache) · est. ${report.run.estimatedUsd.toFixed(2)}
      </p>
    </div>
  );
}

function countNumbers(report: ExtractedReport): number {
  let n = 0;
  for (const g of report.goals) if (g.targetValue !== null) n++;
  for (const b of report.bmps) {
    if (b.quantity !== null) n++;
    if (b.estimatedCost !== null) n++;
  }
  for (const a of report.implementation) if (a.cost !== null) n++;
  for (const m of report.monitoring) if (m.value !== null) n++;
  for (const o of report.outreach) if (o.count !== null) n++;
  for (const a of report.geographicAreas) if (a.areaValue !== null) n++;
  return n;
}

function ExportMenu({ jobId }: { jobId: string }) {
  return (
    <details className="relative shrink-0">
      <summary className="btn inline-flex cursor-pointer list-none items-center gap-2 rounded-md border border-line-strong bg-surface px-4 py-2 font-semibold hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
        Export
        <span aria-hidden="true">▾</span>
      </summary>
      <ul className="absolute right-0 z-10 mt-1 w-44 overflow-hidden rounded-md border border-line bg-surface py-1 shadow-lg">
        {(
          [
            ["json", "JSON (full report)"],
            ["csv", "CSV (one sheet)"],
            ["xlsx", "Excel (sheet per category)"],
          ] as const
        ).map(([format, label]) => (
          <li key={format}>
            <a href={exportUrl(jobId, format)} download className="row-action block px-3 py-2 text-sm hover:bg-surface-2">
              {label}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
