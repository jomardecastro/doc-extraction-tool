import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import type { FastifyBaseLogger } from "fastify";
import type { Category } from "@det/shared";
import type { Config } from "../config.js";
import { AppError, toAppError } from "../errors.js";
import type { Budget } from "../llm/budget.js";
import type { LlmProvider } from "../llm/provider.js";
import { JobStore, stagePct, type JobRecord } from "./job-store.js";
import { runPipeline } from "./pipeline.js";
import { JobQueue } from "./queue.js";

export interface SubmitInput {
  filename: string;
  sizeBytes: number;
  sha256: string;
  tmpFile: string;
  noCache?: boolean;
}

/**
 * Glue between the HTTP layer and the pipeline: creates job records, feeds the queue, turns
 * pipeline progress into job updates, and cleans up the temp upload whatever happens.
 */
export class JobService {
  readonly store: JobStore;
  readonly queue: JobQueue;

  constructor(
    private readonly config: Config,
    private readonly provider: LlmProvider,
    private readonly budget: Budget,
    private readonly log: FastifyBaseLogger,
  ) {
    this.store = new JobStore(config.DATA_DIR, (err) =>
      this.log.error({ err }, "could not persist job"),
    );
    this.queue = new JobQueue(
      config.JOB_CONCURRENCY,
      config.JOB_TIMEOUT_MIN * 60_000,
      20,
      (id, err) => {
        void this.fail(id, err);
      },
    );
  }

  async init(): Promise<void> {
    const restarted = await this.store.load();
    if (restarted > 0)
      this.log.warn({ restarted }, "jobs interrupted by the last restart were marked failed");
    await this.sweepTmp();
  }

  /**
   * Deletes every leftover upload in DATA_DIR/tmp. Nothing is in flight when the server starts
   * (interrupted jobs were just marked failed), so anything still there is an orphan from a
   * crash or an older build.
   */
  private async sweepTmp(): Promise<void> {
    const dir = path.join(this.config.DATA_DIR, "tmp");
    await mkdir(dir, { recursive: true });
    let removed = 0;
    for (const name of await readdir(dir)) {
      try {
        await rm(path.join(dir, name), { force: true });
        removed++;
      } catch (err) {
        this.log.warn({ err, file: name }, "could not remove orphaned upload");
      }
    }
    if (removed > 0) this.log.info({ removed }, "removed orphaned uploads");
  }

  async submit(input: SubmitInput): Promise<JobRecord> {
    const now = new Date().toISOString();
    const job = this.store.create({
      id: randomUUID(),
      status: "queued",
      stage: "queued",
      pct: 0,
      filename: input.filename,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
      pages: null,
      createdAt: now,
      updatedAt: now,
      cached: false,
      completedCategories: [],
      error: null,
      result: null,
      tmpFile: input.tmpFile,
      noCache: input.noCache ?? false,
    });
    try {
      this.queue.enqueue(job.id, () => this.process(job.id));
    } catch (err) {
      await this.fail(job.id, err);
    }
    return job;
  }

  private async process(id: string): Promise<void> {
    const job = this.store.get(id);
    if (!job || !job.tmpFile) throw new AppError("job_not_found");
    // store.update() patches this same object, so keep the path before it is nulled below.
    const tmpFile = job.tmpFile;
    this.store.update(id, {
      status: "processing",
      stage: "extracting_text",
      pct: stagePct("extracting_text", 0),
    });
    const data = new Uint8Array(await readFile(tmpFile));
    const jobLog = this.log.child({ job: id, filename: job.filename });

    const { report, cached } = await runPipeline(
      { data, filename: job.filename, sha256: job.sha256 },
      {
        provider: this.provider,
        config: this.config,
        budget: this.budget,
        log: (message, extra) => jobLog.info(extra ?? {}, message),
      },
      {
        useResultCache: !job.noCache,
        onProgress: (p) => {
          const completed = (p.completedCategories ?? job.completedCategories) as Category[];
          this.store.update(id, {
            stage: p.stage,
            pct: stagePct(p.stage, completed.length),
            completedCategories: completed,
            ...(p.pages !== undefined ? { pages: p.pages } : {}),
          });
        },
      },
    );
    this.store.update(id, {
      status: "done",
      stage: "done",
      pct: 100,
      cached,
      pages: report.document.pages,
      result: report,
      tmpFile: null,
    });
    await this.removeTmp(tmpFile);
  }

  private async fail(id: string, err: unknown): Promise<void> {
    const error = toAppError(err);
    const tmpFile = this.store.get(id)?.tmpFile ?? null;
    if (error.code === "internal") this.log.error({ err, job: id }, "job failed");
    else this.log.warn({ job: id, code: error.code, message: error.message }, "job failed");
    this.store.update(id, {
      status: "failed",
      stage: "failed",
      pct: 100,
      error: error.toJSON(),
      tmpFile: null,
    });
    await this.removeTmp(tmpFile);
  }

  private async removeTmp(file: string | null): Promise<void> {
    if (!file) return;
    try {
      await rm(file, { force: true });
    } catch (err) {
      this.log.warn({ err, file }, "could not remove upload");
    }
  }
}
