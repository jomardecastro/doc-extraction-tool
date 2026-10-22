import { useState } from "react";
import { Link } from "react-router";
import { forgetRecent, readRecent, type RecentDocument } from "../../lib/recent.js";
import { formatWhen, truncateMiddle } from "../../lib/format.js";
import { Section } from "../ui.js";

/** Documents this browser processed before; stored locally, so nothing here is shared or authoritative. */
export function RecentList() {
  const [items, setItems] = useState<RecentDocument[]>(() => readRecent());
  if (items.length === 0) return null;
  return (
    <Section title="Recently processed in this browser">
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {items.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
            <Link
              to={`/documents/${r.id}`}
              className="row-action min-w-0 flex-1 truncate font-semibold text-ink hover:text-accent"
            >
              {truncateMiddle(r.filename)}
            </Link>
            <span className="shrink-0 text-sm text-ink-3">{formatWhen(r.at)}</span>
            <button
              type="button"
              className="row-action shrink-0 text-sm text-ink-3 hover:text-ink"
              onClick={() => {
                forgetRecent(r.id);
                setItems(readRecent());
              }}
              aria-label={`Remove ${r.filename} from recent`}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
