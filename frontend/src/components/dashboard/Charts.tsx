import { Bar, BarChart, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CATEGORIES, CATEGORY_KEYS, CATEGORY_LABELS, type ExtractedReport } from "@det/shared";

const ACCENT = "oklch(0.5 0.11 200)";
const GRAY = "oklch(0.82 0.01 260)";
const INK2 = "oklch(0.46 0.02 260)";

const BMP_LABELS: Record<string, string> = {
  agricultural: "Agricultural",
  structural: "Structural",
  streambank_riparian: "Streambank / riparian",
  urban_stormwater: "Urban stormwater",
  forestry: "Forestry",
  wastewater_septic: "Wastewater / septic",
  education: "Education",
  other: "Other",
};
const STATUS_LABELS: Record<string, string> = { completed: "Completed", in_progress: "In progress", planned: "Planned", unknown: "No status" };

/**
 * Three honest charts: bars start at zero, one accent on the largest value with gray for the
 * rest, direct labels instead of legends, no grid lines. The status donut only appears when
 * at least some items carry a status, because a ring of "unknown" says nothing.
 */
export function ItemsPerCategoryChart({ report }: { report: ExtractedReport }) {
  const data = CATEGORIES.map((c) => ({ name: CATEGORY_LABELS[c], value: report[CATEGORY_KEYS[c]].length }));
  return <HorizontalBars data={data} title="Items per category" />;
}

export function BmpCategoryChart({ report }: { report: ExtractedReport }) {
  const data = Object.entries(report.summary.byBmpCategory)
    .map(([k, v]) => ({ name: BMP_LABELS[k] ?? k, value: v }))
    .sort((a, b) => b.value - a.value);
  if (data.length === 0) return <EmptyChart title="BMPs by category" note="No BMPs were extracted from this plan." />;
  return <HorizontalBars data={data} title="BMPs by category" />;
}

export function ItemsByPageChart({ report }: { report: ExtractedReport }) {
  const counts = new Map<number, number>();
  for (const c of CATEGORIES) for (const item of report[CATEGORY_KEYS[c]]) counts.set(item.page, (counts.get(item.page) ?? 0) + 1);
  const pages = report.document.pages;
  const data = Array.from({ length: pages }, (_, i) => ({ page: i + 1, value: counts.get(i + 1) ?? 0 }));
  const max = Math.max(0, ...data.map((d) => d.value));
  return (
    <figure className="rounded-lg border border-line bg-surface p-4">
      <figcaption className="text-sm font-semibold text-ink-2">Where the content sits, by page</figcaption>
      <div className="mt-2 h-36">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: -24, bottom: 0 }} barCategoryGap={1}>
            <XAxis dataKey="page" tick={{ fontSize: 11, fill: INK2 }} tickLine={false} axisLine={{ stroke: GRAY }} interval={pages > 40 ? Math.ceil(pages / 12) : pages > 15 ? 2 : 0} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: INK2 }} tickLine={false} axisLine={false} width={40} />
            <Tooltip cursor={{ fill: "oklch(0.96 0.004 260)" }} formatter={(v) => [`${v} items`, ""]} labelFormatter={(l) => `Page ${l}`} contentStyle={{ fontSize: 13, borderRadius: 8, border: "1px solid oklch(0.9 0.008 260)" }} />
            <Bar dataKey="value" isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.page} fill={d.value === max && max > 0 ? ACCENT : GRAY} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function StatusChart({ report }: { report: ExtractedReport }) {
  if (report.summary.completionRateBasis !== "status") return null;
  const data = Object.entries(report.summary.byStatus)
    .filter(([k]) => k !== "unknown")
    .map(([k, v]) => ({ name: STATUS_LABELS[k] ?? k, value: v, key: k }));
  const total = data.reduce((n, d) => n + d.value, 0);
  return (
    <figure className="rounded-lg border border-line bg-surface p-4">
      <figcaption className="text-sm font-semibold text-ink-2">Status of BMPs and activities</figcaption>
      <div className="mt-2 flex items-center gap-4">
        <div className="h-32 w-32 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={38} outerRadius={60} stroke="none" isAnimationActive={false}>
                {data.map((d) => (
                  <Cell key={d.key} fill={d.key === "completed" ? ACCENT : d.key === "in_progress" ? "oklch(0.7 0.07 200)" : GRAY} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="space-y-1 text-sm">
          {data.map((d) => (
            <li key={d.key} className="flex items-center gap-2">
              <span className="inline-block size-2.5 rounded-sm" style={{ background: d.key === "completed" ? ACCENT : d.key === "in_progress" ? "oklch(0.7 0.07 200)" : GRAY }} />
              <span className="text-ink-2">{d.name}</span>
              <span className="num font-semibold">{d.value}</span>
              <span className="num text-ink-3">{total ? `${Math.round((d.value / total) * 100)}%` : ""}</span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}

function HorizontalBars({ data, title }: { data: Array<{ name: string; value: number }>; title: string }) {
  const max = Math.max(0, ...data.map((d) => d.value));
  const height = 28 * data.length + 16;
  return (
    <figure className="rounded-lg border border-line bg-surface p-4">
      <figcaption className="text-sm font-semibold text-ink-2">{title}</figcaption>
      <div style={{ height }} className="mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, left: 8, bottom: 4 }} barCategoryGap={6}>
            <XAxis type="number" hide domain={[0, Math.max(1, max)]} />
            <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 13, fill: INK2 }} tickLine={false} axisLine={false} />
            <Bar dataKey="value" isAnimationActive={false} radius={[0, 4, 4, 0]}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.value === max && max > 0 ? ACCENT : GRAY} />
              ))}
              <LabelList dataKey="value" position="right" style={{ fontSize: 13, fill: INK2, fontVariantNumeric: "tabular-nums" }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function EmptyChart({ title, note }: { title: string; note: string }) {
  return (
    <figure className="rounded-lg border border-line bg-surface p-4">
      <figcaption className="text-sm font-semibold text-ink-2">{title}</figcaption>
      <p className="mt-2 text-sm text-ink-3">{note}</p>
    </figure>
  );
}
