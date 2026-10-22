import type { FastifyInstance } from "fastify";
import type { HealthView } from "@det/shared";
import type { Config } from "../config.js";
import type { Budget } from "../llm/budget.js";
import type { JobService } from "../jobs/service.js";
import type { LlmProvider } from "../llm/provider.js";

interface HealthRouteOptions {
  config: Config;
  provider: LlmProvider;
  jobs: JobService;
  budget: Budget;
}

/** Used by the container healthcheck, the deploy script (version match) and the UI footer. */
export async function healthRoutes(app: FastifyInstance, options: HealthRouteOptions): Promise<void> {
  const started = Date.now();
  app.get<{ Reply: HealthView }>("/api/health", async () => ({
    ok: true,
    version: options.config.APP_VERSION,
    provider: options.provider.name,
    model: options.provider.model,
    uptimeSeconds: Math.round((Date.now() - started) / 1000),
    queue: options.jobs.queue.stats(),
    budget: options.budget.view(),
  }));
}
