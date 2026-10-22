import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import type { Config } from "./config.js";
import { AppError, toAppError } from "./errors.js";
import { Budget } from "./llm/budget.js";
import { createProvider } from "./llm/index.js";
import { JobService } from "./jobs/service.js";
import { documentRoutes } from "./routes/documents.js";
import { healthRoutes } from "./routes/health.js";
import { sampleRoutes } from "./routes/samples.js";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Builds the server: API routes under /api, the built frontend from `public/` when it exists
 * (production image), and one error handler that turns every failure into `{code, message,
 * retryable}` so the client never has to parse a stack trace.
 */
export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "test" ? "silent" : "info",
      ...(config.NODE_ENV === "development" ? { transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } } } : {}),
    },
    // Behind nginx: X-Real-IP / X-Forwarded-For identify the client for rate limiting.
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  const provider = createProvider(config);
  const budget = new Budget(path.join(config.DATA_DIR, "budget.json"), config.DAILY_USD_CAP);
  await budget.load();
  const jobs = new JobService(config, provider, budget, app.log);
  await jobs.init();

  await app.register(rateLimit, { global: false, keyGenerator: (req) => req.ip });
  await app.register(multipart, { throwFileSizeLimit: true });
  if (config.NODE_ENV === "development") await app.register(cors, { origin: true });

  app.setErrorHandler((err, request, reply) => {
    const appError = err instanceof AppError ? err : fromFastifyError(err);
    if (appError.code === "internal") request.log.error({ err }, "request failed");
    void reply.code(appError.status).send(appError.toJSON());
  });
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) {
      void reply.code(404).send(new AppError("job_not_found", "No such API route.").toJSON());
      return;
    }
    // Any other path is a client-side route of the SPA.
    void reply.sendFile("index.html");
  });

  await app.register(healthRoutes, { config, provider, jobs, budget });
  await app.register(documentRoutes, { jobs, dataDir: config.DATA_DIR, maxUploadBytes: config.maxUploadBytes, uploadsPerHourPerIp: config.UPLOADS_PER_HOUR_PER_IP });
  await app.register(sampleRoutes, { jobs, samplesDir: samplesDir(), dataDir: config.DATA_DIR });

  const publicDir = path.resolve(here, "..", "public");
  if (existsSync(publicDir)) {
    await app.register(fastifyStatic, { root: publicDir, prefix: "/", index: ["index.html"], maxAge: "1h", immutable: false });
  } else {
    await app.register(fastifyStatic, { root: here, serve: false });
    app.log.warn("no public/ build found; only /api routes are served (run the frontend dev server separately)");
  }

  return app;
}

/** Fastify's own errors (bad JSON, payload too large, rate limited) mapped to our codes. */
function fromFastifyError(err: unknown): AppError {
  const e = err as { statusCode?: number; code?: string; message?: string };
  if (e.statusCode === 429) return new AppError("queue_full", "Too many uploads from this address. Try again in a while.", { cause: err });
  if (e.statusCode === 413 || e.code === "FST_REQ_FILE_TOO_LARGE") return new AppError("file_too_large", undefined, { cause: err });
  if (e.statusCode === 415 || e.code === "FST_INVALID_MULTIPART_CONTENT_TYPE") return new AppError("invalid_file_type", undefined, { cause: err });
  if (typeof e.statusCode === "number" && e.statusCode >= 400 && e.statusCode < 500) {
    return new AppError("internal", e.message ?? "Bad request.", { cause: err, status: e.statusCode, retryable: false });
  }
  return toAppError(err);
}

/** `backend/samples` in development, `/app/samples` in the image (both sit next to `src`/`dist`). */
function samplesDir(): string {
  const candidates = [path.resolve(here, "..", "samples"), path.resolve(here, "samples")];
  return candidates.find((c) => existsSync(c)) ?? candidates[0]!;
}
