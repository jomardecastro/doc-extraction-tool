import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { useNavigate } from "react-router";
import { ApiRequestError, uploadDocument, type UploadProgress } from "../../api/client.js";
import { formatBytes, truncateMiddle } from "../../lib/format.js";
import { rememberRecent } from "../../lib/recent.js";
import { Button, Icon } from "../ui.js";

const MAX_MB = 200;

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; file: File; progress: UploadProgress | null }
  | { kind: "error"; file: File | null; title: string; detail: string; retryable: boolean };

/**
 * The one primary action of the app. The zone answers back while a file hovers over it, the
 * upload shows honest progress (percent, speed, time left) because a 100 MB PDF takes a while,
 * and every failure keeps the chosen file so Retry means retry, not start over.
 */
export function UploadDropzone() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const start = useCallback(
    async (file: File) => {
      abort.current = new AbortController();
      setPhase({ kind: "uploading", file, progress: null });
      try {
        const accepted = await uploadDocument(file, {
          signal: abort.current.signal,
          onProgress: (progress) =>
            setPhase((p) => (p.kind === "uploading" ? { ...p, progress } : p)),
        });
        rememberRecent({ id: accepted.id, filename: file.name, at: new Date().toISOString() });
        navigate(`/documents/${accepted.id}`);
      } catch (err) {
        const e = err instanceof ApiRequestError ? err : null;
        setPhase({
          kind: "error",
          file,
          title:
            e?.code === "file_too_large"
              ? "That file is too large"
              : e?.code === "invalid_file_type"
                ? "That file is not a PDF"
                : "Upload failed",
          detail: e?.message ?? "Something went wrong while uploading.",
          retryable: e?.retryable ?? true,
        });
      }
    },
    [navigate],
  );

  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      const rejected = rejections[0];
      if (rejected) {
        const tooBig = rejected.errors.some((e) => e.code === "file-too-large");
        setPhase({
          kind: "error",
          file: null,
          title: tooBig ? "That file is too large" : "That file is not a PDF",
          detail: tooBig
            ? `${truncateMiddle(rejected.file.name)} is ${formatBytes(rejected.file.size)}. The limit is ${MAX_MB} MB.`
            : `${truncateMiddle(rejected.file.name)} does not look like a PDF. Choose a .pdf file.`,
          retryable: false,
        });
        return;
      }
      const file = accepted[0];
      if (file) void start(file);
    },
    [start],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxSize: MAX_MB * 1024 * 1024,
    multiple: false,
    noClick: true,
    noKeyboard: true,
    disabled: phase.kind === "uploading",
  });

  if (phase.kind === "uploading") {
    const p = phase.progress;
    const fraction = p ? p.loaded / p.total : 0;
    const remaining = p && p.rate > 0 ? Math.max(0, (p.total - p.loaded) / p.rate) : null;
    return (
      <div className="rounded-lg border border-line bg-surface p-6" aria-live="polite">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate font-semibold">{phase.file.name}</p>
            <p className="text-sm text-ink-2">{formatBytes(phase.file.size)}</p>
          </div>
          <Button variant="ghost" className="shrink-0" onClick={() => abort.current?.abort()}>
            Cancel
          </Button>
        </div>
        <div
          className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fraction * 100)}
          aria-label="Upload progress"
        >
          <div
            className="h-full bg-accent transition-[width] duration-150"
            style={{ width: `${Math.max(2, fraction * 100)}%` }}
          />
        </div>
        <p className="num mt-2 text-sm text-ink-2">
          {p ? (
            <>
              Uploading {Math.round(fraction * 100)}% · {formatBytes(p.rate)}/s
              {remaining !== null ? ` · about ${Math.ceil(remaining)}s left` : ""}
            </>
          ) : (
            "Starting upload"
          )}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div
        {...getRootProps({
          className: `rounded-lg border-2 border-dashed p-8 text-center transition-colors duration-150 ${isDragActive ? "border-accent bg-accent-soft" : "border-line-strong bg-surface"}`,
        })}
      >
        <input {...getInputProps({ "aria-label": "Choose a PDF" })} />
        <div
          className={`mx-auto flex size-14 items-center justify-center rounded-full ${isDragActive ? "bg-accent text-white" : "bg-surface-2 text-ink-2"}`}
        >
          <Icon.Upload />
        </div>
        <p className="mt-4 text-lg font-semibold">
          {isDragActive ? "Release to upload" : "Drop a watershed plan PDF here"}
        </p>
        <p className="mt-1 text-sm text-ink-2">
          PDF up to {MAX_MB} MB. Text-based documents only; scanned PDFs are detected and refused.
        </p>
        <div className="mt-5">
          <Button onClick={open}>Choose a PDF</Button>
        </div>
      </div>
      {/* Space is reserved so the error never shifts the layout below the zone. */}
      <div className="min-h-14 pt-3" aria-live="assertive">
        {phase.kind === "error" && (
          <div className="flex items-start gap-3 rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm">
            <span className="mt-0.5 text-danger">
              <Icon.Alert />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">{phase.title}</p>
              <p className="text-ink-2">{phase.detail}</p>
            </div>
            {phase.file && phase.retryable ? (
              <Button
                variant="secondary"
                className="shrink-0 !py-1 !text-sm"
                onClick={() => void start(phase.file!)}
              >
                Retry
              </Button>
            ) : (
              <Button variant="secondary" className="shrink-0 !py-1 !text-sm" onClick={open}>
                Choose another
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
