import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ApiError, Category, ExtractedReport, JobStage, JobStatus, JobView } from "@det/shared";

export interface JobRecord {
  id: string;
  status: JobStatus;
  stage: JobStage;
  pct: number;
  filename: string;
  sizeBytes: number;
  sha256: string;
  pages: number | null;
  createdAt: string;
  updatedAt: string;
  cached: boolean;
  completedCategories: Category[];
  error: ApiError | null;
  result: ExtractedReport | null;
  /** Temp upload path while the job waits; deleted once processed. */
  tmpFile: string | null;
  /** Skip the result cache (the "Re-run live" button). */
  noCache: boolean;
}

/**
 * Jobs live in memory and are mirrored to `DATA_DIR/jobs/<id>.json` so finished reports survive
 * a restart. Anything that was still running when the process died is marked failed on boot;
 * the upload is gone with the temp dir, so the client is told to upload again.
 *
 * Updates apply to memory immediately; the file write is coalesced per job (progress events can
 * arrive many times a second during text extraction) and serialised so two writes never race
 * on the same temp file.
 */
export class JobStore {
  private readonly jobs = new Map<string, JobRecord>();
  private readonly dir: string;
  private readonly writing = new Map<string, Promise<void>>();
  private readonly dirty = new Set<string>();

  constructor(
    dataDir: string,
    private readonly onError: (err: unknown) => void = () => {},
  ) {
    this.dir = path.join(dataDir, "jobs");
  }

  async load(): Promise<number> {
    await mkdir(this.dir, { recursive: true });
    let restarted = 0;
    for (const name of await readdir(this.dir)) {
      if (!name.endsWith(".json")) continue;
      try {
        const job = JSON.parse(await readFile(path.join(this.dir, name), "utf8")) as JobRecord;
        if (job.status === "queued" || job.status === "processing") {
          job.status = "failed";
          job.stage = "failed";
          job.error = { code: "server_restarted", message: "The server restarted while this document was processing. Upload it again.", retryable: true };
          job.tmpFile = null;
          restarted++;
          this.jobs.set(job.id, job);
          this.schedulePersist(job.id);
        } else {
          this.jobs.set(job.id, job);
        }
      } catch {
        // a half-written file from a crash; ignore it
      }
    }
    return restarted;
  }

  get(id: string): JobRecord | undefined {
    return this.jobs.get(id);
  }

  all(): JobRecord[] {
    return [...this.jobs.values()];
  }

  create(job: JobRecord): JobRecord {
    this.jobs.set(job.id, job);
    this.schedulePersist(job.id);
    return job;
  }

  update(id: string, patch: Partial<JobRecord>): JobRecord | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
    this.schedulePersist(id);
    return job;
  }

  /** Resolves once every pending write has landed (used by tests and shutdown). */
  async flush(): Promise<void> {
    await Promise.all([...this.writing.values()]);
  }

  private schedulePersist(id: string): void {
    this.dirty.add(id);
    if (this.writing.has(id)) return; // the in-flight write will pick up the latest state
    const run = (async () => {
      while (this.dirty.has(id)) {
        this.dirty.delete(id);
        const job = this.jobs.get(id);
        if (!job) break;
        try {
          await mkdir(this.dir, { recursive: true });
          const file = path.join(this.dir, `${id}.json`);
          const tmp = `${file}.${process.pid}.tmp`;
          await writeFile(tmp, JSON.stringify(job));
          await rename(tmp, file);
        } catch (err) {
          this.onError(err);
        }
      }
      this.writing.delete(id);
    })();
    this.writing.set(id, run);
  }
}

export function toView(job: JobRecord): JobView {
  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    pct: job.pct,
    filename: job.filename,
    sizeBytes: job.sizeBytes,
    pages: job.pages,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    cached: job.cached,
    completedCategories: job.completedCategories,
    error: job.error,
    result: job.status === "done" ? job.result : null,
  };
}

/** Progress bar position per stage; the six category stages advance with completed categories. */
export function stagePct(stage: JobStage, completedCategories: number): number {
  switch (stage) {
    case "queued":
      return 0;
    case "extracting_text":
      return 8;
    case "cleaning":
      return 14;
    case "segmenting":
      return 17;
    case "llm_metadata":
      return 93;
    case "validating":
      return 97;
    case "done":
      return 100;
    case "failed":
      return 100;
    default:
      return 20 + Math.min(6, completedCategories) * 12;
  }
}
