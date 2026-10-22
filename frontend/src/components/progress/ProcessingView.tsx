import { useEffect, useState } from "react";
import { CATEGORIES, CATEGORY_LABELS, type JobView } from "@det/shared";
import { formatBytes, formatDuration } from "../../lib/format.js";
import { Icon, Spinner } from "../ui.js";

type Step = { key: string; label: string; done: boolean; active: boolean };

/**
 * A stepper for the minutes a document takes. The thirteen internal stages collapse into five
 * visible steps; the extraction step lists the six categories so the bar moves every ~20s
 * instead of sitting at "Extracting" for two minutes.
 */
export function ProcessingView({ job }: { job: JobView }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = now - new Date(job.createdAt).getTime();
  const stage = job.stage;
  const reading = ["extracting_text", "cleaning", "segmenting"];
  const extracting = stage.startsWith("llm_") && stage !== "llm_metadata";
  const afterExtract = stage === "llm_metadata" || stage === "validating" || stage === "done";

  const steps: Step[] = [
    { key: "queue", label: "Queued", done: stage !== "queued", active: stage === "queued" },
    {
      key: "read",
      label: "Reading the PDF",
      done: !reading.includes(stage) && stage !== "queued",
      active: reading.includes(stage),
    },
    {
      key: "extract",
      label: "Extracting with the language model",
      done: afterExtract,
      active: extracting,
    },
    {
      key: "verify",
      label: "Verifying quotes against the PDF",
      done: stage === "done",
      active: stage === "llm_metadata" || stage === "validating",
    },
  ];
  const completed = new Set(job.completedCategories);
  const currentCategory = extracting ? stage.replace("llm_", "") : null;

  return (
    <div className="rounded-lg border border-line bg-surface p-6" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="min-w-0 truncate text-lg font-semibold">{job.filename}</h1>
        <p className="num text-sm text-ink-2">
          {formatBytes(job.sizeBytes)}
          {job.pages ? ` · ${job.pages} pages` : ""} · {formatDuration(elapsed)} elapsed
        </p>
      </div>
      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={job.pct}
        aria-label="Processing progress"
      >
        <div
          className="h-full bg-accent transition-[width] duration-300"
          style={{ width: `${Math.max(2, job.pct)}%` }}
        />
      </div>
      <ol className="mt-5 space-y-3">
        {steps.map((s) => (
          <li key={s.key} className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${s.done ? "border-accent bg-accent text-white" : s.active ? "border-accent text-accent" : "border-line-strong text-ink-3"}`}
            >
              {s.done ? <Icon.Check /> : s.active ? <Spinner className="size-3 border" /> : null}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={`${s.active ? "font-semibold text-ink" : s.done ? "text-ink-2" : "text-ink-3"}`}
              >
                {s.label}
              </p>
              {s.key === "extract" && (s.active || s.done) && (
                <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm sm:grid-cols-3">
                  {CATEGORIES.map((c) => {
                    const done = completed.has(c);
                    const running = currentCategory === c && !done;
                    return (
                      <li
                        key={c}
                        className={`flex items-center gap-1.5 ${done ? "text-ink-2" : running ? "text-ink" : "text-ink-3"}`}
                      >
                        <span className="inline-flex size-3.5 items-center justify-center">
                          {done ? (
                            <Icon.Check />
                          ) : running ? (
                            <Spinner className="size-3 border" />
                          ) : (
                            <span className="size-1.5 rounded-full bg-line-strong" />
                          )}
                        </span>
                        {CATEGORY_LABELS[c]}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-5 text-sm text-ink-3">
        A typical plan takes one to three minutes. You can leave this page open; it updates by
        itself.
      </p>
    </div>
  );
}
