import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import type { SampleInfo } from "@det/shared";
import { listSamples, processSample } from "../../api/client.js";
import { formatBytes } from "../../lib/format.js";
import { rememberRecent } from "../../lib/recent.js";
import { Badge, Icon, Spinner } from "../ui.js";

const FAMILY: Record<SampleInfo["family"], string> = { watershed_plan: "Watershed plan", nine_element: "9 Key Element plan", other: "Plan" };

/**
 * Public MDEQ plans bundled with the app so a reviewer can see results without hunting for a
 * PDF. Rows open the stored result instantly when one exists; "Re-run live" bypasses the cache
 * and bills the model, which is why it is the quiet secondary action.
 */
export function SampleList() {
  const navigate = useNavigate();
  const samples = useQuery({ queryKey: ["samples"], queryFn: listSamples, staleTime: 60_000 });
  const [busy, setBusy] = useState<string | null>(null);
  const run = useMutation({
    mutationFn: ({ id, live }: { id: string; live: boolean }) => processSample(id, live),
    onMutate: ({ id }) => setBusy(id),
    onSettled: () => setBusy(null),
    onSuccess: (accepted, { id }) => {
      const sample = samples.data?.find((s) => s.id === id);
      rememberRecent({ id: accepted.id, filename: sample ? `${sample.title}.pdf` : id, at: new Date().toISOString() });
      navigate(`/documents/${accepted.id}`);
    },
  });

  if (samples.isPending) {
    return (
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex items-center gap-4 px-4 py-3">
            <div className="h-4 w-4 rounded-sm bg-surface-2" />
            <div className="h-4 w-2/3 rounded-sm bg-surface-2" />
          </li>
        ))}
      </ul>
    );
  }
  if (samples.isError || !samples.data) {
    return (
      <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink-2">
        The sample list could not be loaded.{" "}
        <button type="button" className="font-semibold text-accent" onClick={() => void samples.refetch()}>
          Try again
        </button>
      </p>
    );
  }

  return (
    <div>
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {samples.data.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-3">
            <span className="text-ink-3">
              <Icon.Doc />
            </span>
            <button
              type="button"
              className="row-action min-w-0 flex-1 text-left"
              disabled={busy !== null}
              onClick={() => run.mutate({ id: s.id, live: false })}
              aria-label={`Open ${s.title}`}
            >
              <span className="block truncate font-semibold text-ink hover:text-accent">{s.title}</span>
              <span className="block text-sm text-ink-2">
                {FAMILY[s.family]} · {s.year} · {s.pages} pages · {formatBytes(s.sizeBytes)}
              </span>
            </button>
            {busy === s.id ? (
              <Spinner />
            ) : (
              <>
                {s.precomputed && <Badge className="hidden sm:inline-flex">instant</Badge>}
                <button type="button" className="row-action shrink-0 text-sm text-ink-2 hover:text-accent" disabled={busy !== null} onClick={() => run.mutate({ id: s.id, live: true })}>
                  Re-run live
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="min-h-6 pt-2 text-sm text-danger" aria-live="polite">
        {run.isError && (run.error instanceof Error ? run.error.message : "The sample could not be started.")}
      </div>
    </div>
  );
}
