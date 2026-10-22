import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { SampleInfo, UploadAccepted } from "@det/shared";
import { AppError } from "../errors.js";
import type { JobService } from "../jobs/service.js";
import { sha256 } from "../jobs/pipeline.js";

interface SampleManifestEntry extends Omit<SampleInfo, "precomputed" | "sizeBytes"> {
  file: string;
}

interface SampleRouteOptions {
  jobs: JobService;
  samplesDir: string;
  dataDir: string;
}

/**
 * Bundled public MDEQ plans so a reviewer can try the tool without finding a PDF first.
 * Results precomputed at build time ship in `samples/results/` and are copied into the
 * result cache on boot, so a sample opens instantly; "process live" bypasses the cache.
 */
export async function sampleRoutes(
  app: FastifyInstance,
  options: SampleRouteOptions,
): Promise<void> {
  const manifest = JSON.parse(
    await readFile(path.join(options.samplesDir, "manifest.json"), "utf8"),
  ) as SampleManifestEntry[];
  const samples = new Map<string, SampleInfo & { file: string; sha256: string }>();

  const resultsDir = path.join(options.dataDir, "results");
  await mkdir(resultsDir, { recursive: true });
  for (const entry of manifest) {
    const file = path.join(options.samplesDir, entry.file);
    const data = await readFile(file);
    const hash = sha256(new Uint8Array(data));
    let precomputed = false;
    try {
      const precomputedDir = path.join(options.samplesDir, "results");
      const { readdir } = await import("node:fs/promises");
      for (const name of await readdir(precomputedDir)) {
        if (name.startsWith(hash)) {
          await copyFile(path.join(precomputedDir, name), path.join(resultsDir, name));
          precomputed = true;
        }
      }
    } catch {
      // no precomputed results directory
    }
    samples.set(entry.id, {
      ...entry,
      sizeBytes: (await stat(file)).size,
      precomputed,
      file,
      sha256: hash,
    });
  }
  app.log.info({ samples: samples.size }, "samples loaded");

  app.get<{ Reply: SampleInfo[] }>("/api/samples", async () => {
    return [...samples.values()].map(({ file: _file, sha256: _hash, ...info }) => info);
  });

  app.post<{ Params: { id: string }; Querystring: { live?: string }; Reply: UploadAccepted }>(
    "/api/samples/:id/process",
    async (request, reply) => {
      const sample = samples.get(request.params.id);
      if (!sample) throw new AppError("job_not_found", "Unknown sample.");
      const tmpDir = path.join(options.dataDir, "tmp");
      await mkdir(tmpDir, { recursive: true });
      const tmpFile = path.join(tmpDir, `${randomUUID()}.pdf`);
      await copyFile(sample.file, tmpFile);
      const job = await options.jobs.submit({
        filename: path.basename(sample.file),
        sizeBytes: sample.sizeBytes,
        sha256: sample.sha256,
        tmpFile,
        noCache: request.query.live === "1",
      });
      return reply.code(202).send({ id: job.id, status: job.status, cached: job.cached });
    },
  );
}
