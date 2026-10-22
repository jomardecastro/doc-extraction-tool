import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import type { ExportFormat, UploadAccepted } from "@det/shared";
import { AppError } from "../errors.js";
import { reportToCsv } from "../export/csv.js";
import { reportToXlsx } from "../export/xlsx.js";
import { toView } from "../jobs/job-store.js";
import type { JobService } from "../jobs/service.js";

interface DocumentRouteOptions {
  jobs: JobService;
  dataDir: string;
  maxUploadBytes: number;
  uploadsPerHourPerIp: number;
}

const PDF_MAGIC = "%PDF-";

export async function documentRoutes(
  app: FastifyInstance,
  options: DocumentRouteOptions,
): Promise<void> {
  const tmpDir = path.join(options.dataDir, "tmp");
  await mkdir(tmpDir, { recursive: true });

  /**
   * Upload. The file is streamed straight to disk while a SHA-256 is computed and the first
   * bytes are checked for the PDF signature; nothing is buffered in memory, which is what makes
   * 100 MB+ uploads fine on a small box. The response is a job id to poll.
   */
  app.post<{ Reply: UploadAccepted }>(
    "/api/documents",
    {
      config: {
        rateLimit: { max: options.uploadsPerHourPerIp, timeWindow: "1 hour" },
      },
    },
    async (request, reply) => {
      const part = await request
        .file({ limits: { fileSize: options.maxUploadBytes, files: 1 } })
        .catch((err: unknown) => {
          throw mapMultipartError(err);
        });
      if (!part)
        throw new AppError(
          "invalid_file_type",
          "Send the PDF as a multipart form field named `file`.",
        );

      const tmpFile = path.join(tmpDir, `${randomUUID()}.pdf`);
      const hash = createHash("sha256");
      let size = 0;
      let head = "";
      const inspect = new Transform({
        transform(chunk: Buffer, _enc, cb) {
          if (head.length < PDF_MAGIC.length)
            head += chunk.subarray(0, PDF_MAGIC.length - head.length).toString("latin1");
          hash.update(chunk);
          size += chunk.length;
          cb(null, chunk);
        },
      });
      try {
        await pipeline(part.file, inspect, createWriteStream(tmpFile));
      } catch (err) {
        throw mapMultipartError(err);
      }
      if (part.file.truncated)
        throw new AppError(
          "file_too_large",
          `The upload limit is ${Math.round(options.maxUploadBytes / 1024 / 1024)} MB.`,
        );
      if (!head.startsWith(PDF_MAGIC)) throw new AppError("invalid_file_type");

      const noCache = (request.query as { live?: string }).live === "1";
      const job = await options.jobs.submit({
        filename: safeName(part.filename),
        sizeBytes: size,
        sha256: hash.digest("hex"),
        tmpFile,
        noCache,
      });
      return reply.code(202).send({ id: job.id, status: job.status, cached: job.cached });
    },
  );

  app.get<{ Params: { id: string } }>("/api/documents/:id", async (request) => {
    const job = options.jobs.store.get(request.params.id);
    if (!job) throw new AppError("job_not_found");
    return toView(job);
  });

  app.get<{ Params: { id: string }; Querystring: { format?: ExportFormat } }>(
    "/api/documents/:id/export",
    async (request, reply) => {
      const job = options.jobs.store.get(request.params.id);
      if (!job) throw new AppError("job_not_found");
      if (job.status !== "done" || !job.result)
        throw new AppError("job_not_found", "That document has not finished processing.");
      const base =
        job.filename.replace(/\.pdf$/i, "").replace(/[^A-Za-z0-9._-]+/g, "_") || "report";
      const format = request.query.format ?? "json";
      switch (format) {
        case "csv":
          return reply
            .header("content-type", "text/csv; charset=utf-8")
            .header("content-disposition", `attachment; filename="${base}.csv"`)
            .send(reportToCsv(job.result));
        case "xlsx":
          return reply
            .header(
              "content-type",
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
            .header("content-disposition", `attachment; filename="${base}.xlsx"`)
            .send(await reportToXlsx(job.result));
        case "json":
          return reply
            .header("content-type", "application/json; charset=utf-8")
            .header("content-disposition", `attachment; filename="${base}.json"`)
            .send(JSON.stringify(job.result, null, 2));
        default:
          throw new AppError("internal", "Unknown export format. Use json, csv or xlsx.", {
            status: 400,
            retryable: false,
          });
      }
    },
  );
}

function safeName(name: string | undefined): string {
  const base = (name ?? "document.pdf").split(/[\\/]/).pop() ?? "document.pdf";
  return base.slice(0, 180) || "document.pdf";
}

function mapMultipartError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const code = (err as { code?: string })?.code ?? "";
  if (code === "FST_REQ_FILE_TOO_LARGE" || code === "FST_FILES_LIMIT")
    return new AppError("file_too_large", undefined, { cause: err });
  if (
    code === "FST_INVALID_MULTIPART_CONTENT_TYPE" ||
    code === "FST_PARTS_LIMIT" ||
    code === "FST_FIELDS_LIMIT"
  ) {
    return new AppError("invalid_file_type", "Send the PDF as a multipart form upload.", {
      cause: err,
    });
  }
  return new AppError("internal", "The upload could not be read.", { cause: err });
}
