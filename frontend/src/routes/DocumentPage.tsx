import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { ApiRequestError, getJob } from "../api/client.js";
import { ProcessingView } from "../components/progress/ProcessingView.js";
import { ReportView } from "../components/dashboard/ReportView.js";
import { Icon, LinkButton } from "../components/ui.js";
import { presentError } from "../lib/errors.js";

/**
 * Polls the job every two seconds until it is done or failed. Polling (not SSE) keeps the
 * deployment simple: nothing to keep open through nginx, and the stepper is just as smooth.
 */
export function DocumentPage() {
  const { id = "" } = useParams();
  const job = useQuery({
    queryKey: ["job", id],
    queryFn: () => getJob(id),
    refetchInterval: (q) =>
      q.state.data && (q.state.data.status === "done" || q.state.data.status === "failed")
        ? false
        : 2000,
    retry: (count, err) => !(err instanceof ApiRequestError && err.status === 404) && count < 3,
  });

  if (job.isPending) {
    return (
      <div
        className="mx-auto max-w-3xl rounded-lg border border-line bg-surface p-6"
        aria-busy="true"
      >
        <div className="h-5 w-1/2 rounded-sm bg-surface-2" />
        <div className="mt-4 h-2 rounded-full bg-surface-2" />
        <div className="mt-5 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-4 w-2/3 rounded-sm bg-surface-2" />
          ))}
        </div>
      </div>
    );
  }

  if (job.isError) {
    const err = job.error instanceof ApiRequestError ? job.error : null;
    const notFound = err?.status === 404;
    return (
      <ErrorCard
        title={notFound ? "This document is no longer available" : "Could not load this document"}
        detail={
          notFound
            ? "Results are kept on the server for a while after processing; this one has expired or the link is wrong."
            : (err?.message ?? "The server could not be reached.")
        }
        primary={{ to: "/", label: "Upload a document" }}
        retry={notFound ? undefined : () => void job.refetch()}
      />
    );
  }

  const data = job.data;
  if (data.status === "failed" && data.error) {
    const p = presentError(data.error);
    return (
      <ErrorCard
        title={p.title}
        detail={p.detail}
        filename={data.filename}
        primary={{
          to: "/",
          label:
            p.action === "retry_upload"
              ? "Upload it again"
              : p.action === "upload_another"
                ? "Choose another PDF"
                : "Back to upload",
        }}
      />
    );
  }

  if (data.status === "done" && data.result) {
    return <ReportView job={data} report={data.result} />;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <ProcessingView job={data} />
    </div>
  );
}

function ErrorCard({
  title,
  detail,
  filename,
  primary,
  retry,
}: {
  title: string;
  detail: string;
  filename?: string;
  primary: { to: string; label: string };
  retry?: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl rounded-lg border border-line bg-surface p-6" role="alert">
      <div className="flex items-start gap-3">
        <span className="mt-1 text-danger">
          <Icon.Alert />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold">{title}</h1>
          {filename && <p className="mt-0.5 truncate text-sm text-ink-3">{filename}</p>}
          <p className="mt-2 max-w-[66ch] text-ink-2">{detail}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <LinkButton to={primary.to}>{primary.label}</LinkButton>
            {retry && (
              <button
                type="button"
                className="btn rounded-md px-4 py-2 font-semibold text-accent hover:bg-accent-soft"
                onClick={retry}
              >
                Try again
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
