import { Fragment, useMemo, useState } from "react";
import type { Category, Confidence, ReportItem } from "@det/shared";
import { formatMoney, formatNumber } from "../../lib/format.js";
import { Icon } from "../ui.js";

interface Column {
  key: string;
  label: string;
  /** Sortable as a number; cells are right-aligned unless `numericCell` says otherwise. */
  numeric?: boolean;
  /** Per-row override: a goal's "Target" is a number for "35%" but a sentence for "meet the criterion". */
  numericCell?: (item: Record<string, unknown>) => boolean;
  render: (item: Record<string, unknown>) => string | null;
}

const isNumericCell = (c: Column, item: Record<string, unknown>) =>
  c.numericCell ? c.numericCell(item) : Boolean(c.numeric);

const text = (k: string) => (i: Record<string, unknown>) =>
  typeof i[k] === "string" && (i[k] as string).length ? (i[k] as string) : null;
const list = (k: string) => (i: Record<string, unknown>) =>
  Array.isArray(i[k]) && (i[k] as string[]).length ? (i[k] as string[]).join(", ") : null;
const num = (k: string, unitKey?: string) => (i: Record<string, unknown>) => {
  const v = i[k];
  if (typeof v !== "number") return null;
  const unit = unitKey && typeof i[unitKey] === "string" ? ` ${i[unitKey] as string}` : "";
  return `${formatNumber(v)}${unit}`;
};
const money = (k: string) => (i: Record<string, unknown>) =>
  typeof i[k] === "number" ? formatMoney(i[k] as number) : null;
const title = (s: string | null) =>
  s ? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : null;

/** Five useful columns per category, chosen for the person reading a plan, not for the schema. */
const COLUMNS: Record<Category, Column[]> = {
  goals: [
    { key: "kind", label: "Kind", render: (i) => title(text("kind")(i)) },
    { key: "pollutants", label: "Pollutants", render: list("pollutants") },
    {
      key: "target",
      label: "Target",
      numeric: true,
      numericCell: (i) => typeof i.targetValue === "number",
      render: (i) => num("targetValue", "targetUnit")(i) ?? text("targetText")(i),
    },
    { key: "timeframe", label: "Timeframe", render: text("timeframe") },
  ],
  bmps: [
    { key: "category", label: "Type", render: (i) => title(text("category")(i)) },
    { key: "quantity", label: "Quantity", numeric: true, render: num("quantity", "unit") },
    { key: "estimatedCost", label: "Est. cost", numeric: true, render: money("estimatedCost") },
    {
      key: "status",
      label: "Status",
      render: (i) => (text("status")(i) === "unknown" ? null : title(text("status")(i))),
    },
    { key: "targetPollutants", label: "Pollutants", render: list("targetPollutants") },
  ],
  implementation: [
    { key: "responsibleParty", label: "Responsible", render: text("responsibleParty") },
    { key: "timeframe", label: "Timeframe", render: text("timeframe") },
    { key: "isMilestone", label: "Milestone", render: (i) => (i.isMilestone ? "Yes" : null) },
    {
      key: "status",
      label: "Status",
      render: (i) => (text("status")(i) === "unknown" ? null : title(text("status")(i))),
    },
    { key: "cost", label: "Cost", numeric: true, render: money("cost") },
  ],
  monitoring: [
    { key: "parameter", label: "Parameter", render: text("parameter") },
    {
      key: "value",
      label: "Value",
      numeric: true,
      render: (i) =>
        typeof i.value === "number"
          ? `${i.comparator ? `${i.comparator as string} ` : ""}${formatNumber(i.value as number)}${i.unit ? ` ${i.unit as string}` : ""}`
          : null,
    },
    {
      key: "valueKind",
      label: "Kind",
      render: (i) => (text("valueKind")(i) === "unspecified" ? null : title(text("valueKind")(i))),
    },
    { key: "frequency", label: "Frequency", render: text("frequency") },
    { key: "location", label: "Location", render: text("location") },
  ],
  outreach: [
    { key: "activityType", label: "Type", render: (i) => title(text("activityType")(i)) },
    { key: "audience", label: "Audience", render: text("audience") },
    { key: "count", label: "Count", numeric: true, render: num("count") },
    { key: "timeframe", label: "Timeframe", render: text("timeframe") },
    { key: "responsibleParty", label: "Responsible", render: text("responsibleParty") },
  ],
  geographic: [
    { key: "areaType", label: "Type", render: (i) => title(text("areaType")(i)) },
    { key: "hucCode", label: "HUC", render: text("hucCode") },
    { key: "areaValue", label: "Area", numeric: true, render: num("areaValue", "areaUnit") },
    { key: "isPrimary", label: "Primary", render: (i) => (i.isPrimary ? "Yes" : null) },
  ],
};

const CONFIDENCE: Record<Confidence, string> = { high: "High", medium: "Medium", low: "Low" };

/**
 * One table per category. Numbers right-aligned with tabular figures and never truncated; text
 * left, one line with the full value in a tooltip; the name (the identity column) wraps to two
 * lines and stays pinned while a wide table scrolls sideways. A hairline between rows, a text
 * filter, and every row expands to the verbatim quote and page it came from, which is the
 * reader's way to check the tool's work. Below ~770px the same rows render as cards.
 */
export function ItemTable({ category, items }: { category: Category; items: ReportItem[] }) {
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [sortNum, setSortNum] = useState<string | null>(null);
  const columns = COLUMNS[category];

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let list = items as unknown as Array<Record<string, unknown> & ReportItem>;
    if (q) list = list.filter((i) => JSON.stringify(i).toLowerCase().includes(q));
    if (sortNum) {
      const col = columns.find((c) => c.key === sortNum);
      if (col)
        list = [...list].sort(
          (a, b) =>
            (parseFloat((col.render(b) ?? "").replace(/[^0-9.-]/g, "")) || -Infinity) -
            (parseFloat((col.render(a) ?? "").replace(/[^0-9.-]/g, "")) || -Infinity),
        );
    }
    return list;
  }, [items, filter, sortNum, columns]);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong px-6 py-10 text-center">
        <p className="font-semibold">Nothing in this category</p>
        <p className="mt-1 text-sm text-ink-2">
          The model found no {labelOf(category)} it could quote from this plan. Other categories may
          still have content.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 py-1.5 focus-within:border-accent">
          <span className="sr-only">Filter {labelOf(category)}</span>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Filter ${items.length} ${labelOf(category)}`}
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-3"
          />
        </label>
        <p className="num text-sm text-ink-2">
          {filter ? `${rows.length} of ${items.length}` : `${items.length} items`}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-line px-6 py-8 text-center text-sm text-ink-2">
          No matches for “{filter}”.{" "}
          <button type="button" className="font-semibold text-accent" onClick={() => setFilter("")}>
            Clear the filter
          </button>
        </div>
      ) : (
        <div className="@container">
          {/* Table from ~770px up */}
          <div className="hidden overflow-x-auto rounded-lg border border-line bg-surface @3xl:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-ink-2">
                <tr className="bg-surface-2">
                  <th className="sticky left-0 z-[1] min-w-[16rem] border-r border-line bg-inherit px-3 py-2 font-semibold">
                    Name
                  </th>
                  {columns.map((c) => (
                    <th
                      key={c.key}
                      className={`px-3 py-2 font-semibold whitespace-nowrap ${c.numeric && rows.every((r) => isNumericCell(c, r)) ? "text-right" : ""}`}
                    >
                      {c.numeric ? (
                        <button
                          type="button"
                          className="hover:text-ink"
                          onClick={() => setSortNum(sortNum === c.key ? null : c.key)}
                          aria-label={`Sort by ${c.label}`}
                        >
                          {c.label}
                          {sortNum === c.key ? " ↓" : ""}
                        </button>
                      ) : (
                        c.label
                      )}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-semibold">Page</th>
                  <th className="px-3 py-2 font-semibold">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => {
                  const isOpen = open === item.id;
                  return (
                    <Fragment key={item.id}>
                      <tr
                        className={`cursor-pointer border-t border-line hover:bg-surface-2 ${isOpen ? "bg-surface-2" : "bg-surface"}`}
                        onClick={() => setOpen(isOpen ? null : item.id)}
                      >
                        <td className="sticky left-0 z-[1] border-r border-line bg-inherit px-3 py-2 align-top">
                          <div className="flex items-start gap-2">
                            <button
                              type="button"
                              className="row-action -ml-1 flex shrink-0 items-center text-ink-3"
                              aria-expanded={isOpen}
                              aria-label={isOpen ? "Hide source" : "Show source"}
                            >
                              <Icon.Chevron open={isOpen} />
                            </button>
                            <span
                              className={`max-w-[26rem] font-semibold text-ink ${isOpen ? "" : "line-clamp-2"}`}
                              title={item.name}
                            >
                              {item.name}
                            </span>
                          </div>
                        </td>
                        {columns.map((c) => {
                          const v = c.render(item);
                          const numeric = isNumericCell(c, item);
                          return (
                            <td
                              key={c.key}
                              className={`px-3 py-2 align-top ${numeric ? "num text-right whitespace-nowrap" : ""} ${v === null ? "text-ink-3" : "text-ink-2"}`}
                            >
                              {v === null ? (
                                "–"
                              ) : numeric ? (
                                v
                              ) : (
                                <span className="block max-w-[18rem] truncate" title={v}>
                                  {v}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="num px-3 py-2 text-right align-top whitespace-nowrap text-ink-2">
                          {item.page}
                        </td>
                        <td className="px-3 py-2 align-top whitespace-nowrap text-ink-2">
                          {CONFIDENCE[item.confidence]}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-t border-line bg-surface-2">
                          <td colSpan={columns.length + 3} className="px-3 pt-1 pb-4">
                            <SourceDetail item={item} columns={columns} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Cards below ~770px: name and the key number first, the rest underneath. */}
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface @3xl:hidden">
            {rows.map((item) => {
              const isOpen = open === item.id;
              const primaryNum = columns.find(
                (c) => isNumericCell(c, item) && c.render(item) !== null,
              );
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="row-action w-full px-4 py-3 text-left"
                    onClick={() => setOpen(isOpen ? null : item.id)}
                    aria-expanded={isOpen}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 flex-1 font-semibold">{item.name}</span>
                      {primaryNum && (
                        <span className="num shrink-0 font-semibold">
                          {primaryNum.render(item)}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-ink-2">
                      {columns
                        .filter((c) => c !== primaryNum)
                        .map((c) => {
                          const v = c.render(item);
                          return v ? (
                            <span key={c.key}>
                              <span className="text-ink-3">{c.label} </span>
                              {v}
                            </span>
                          ) : null;
                        })}
                      <span>
                        <span className="text-ink-3">Page </span>
                        <span className="num">{item.page}</span>
                      </span>
                      <span>
                        <span className="text-ink-3">Confidence </span>
                        {CONFIDENCE[item.confidence]}
                      </span>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="bg-surface-2 px-4 pt-1 pb-4">
                      <SourceDetail item={item} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function SourceDetail({ item, columns }: { item: ReportItem; columns?: Column[] }) {
  const record = item as unknown as Record<string, unknown>;
  const full = (columns ?? []).filter((c) => !isNumericCell(c, record) && c.render(record));
  return (
    <div className="text-sm">
      {full.length > 0 && (
        <dl className="mb-2 grid gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr]">
          {full.map((c) => (
            <Fragment key={c.key}>
              <dt className="text-ink-3">{c.label}</dt>
              <dd className="text-ink">{c.render(record)}</dd>
            </Fragment>
          ))}
        </dl>
      )}
      <p className="text-ink-2">{item.description}</p>
      <blockquote className="mt-2 border-l-2 border-accent pl-3 text-ink">
        “{item.sourceQuote}”
      </blockquote>
      <p className="num mt-1 text-ink-3">
        Page {item.page}
        {item.sectionTitle ? ` · ${item.sectionTitle}` : ""} · quote found verbatim in the PDF
      </p>
    </div>
  );
}

function labelOf(category: Category): string {
  return {
    goals: "goals",
    bmps: "BMPs",
    implementation: "activities",
    monitoring: "metrics",
    outreach: "activities",
    geographic: "areas",
  }[category];
}
