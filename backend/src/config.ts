import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * All configuration comes from the environment (see .env.example). Parsing fails fast at boot
 * with a readable message instead of surfacing as a confusing error on the first upload.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATA_DIR: z.string().default("./data"),
  APP_VERSION: z.string().default("dev"),

  LLM_PROVIDER: z.enum(["anthropic", "mock"]).default("anthropic"),
  ANTHROPIC_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default("claude-opus-5-5"),
  LLM_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("high"),
  LLM_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1024).default(16000),
  LLM_CATEGORY_CONCURRENCY: z.coerce.number().int().min(1).max(6).default(3),
  DAILY_USD_CAP: z.coerce.number().min(0).default(25),

  MAX_UPLOAD_MB: z.coerce.number().min(1).default(200),
  MAX_DOC_TOKENS: z.coerce.number().int().min(1000).default(400000),
  UPLOADS_PER_HOUR_PER_IP: z.coerce.number().int().min(1).default(10),
  JOB_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(1),
  JOB_TIMEOUT_MIN: z.coerce.number().min(1).default(20),

  // Optional: where the source archive can be downloaded; the UI shows a link when set.
  SOURCE_ZIP_URL: z.string().url().optional(),
});

export type Config = z.infer<typeof EnvSchema> & { maxUploadBytes: number };
export type Effort = Config["LLM_EFFORT"];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  const config = parsed.data;
  if (config.LLM_PROVIDER === "anthropic" && !config.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is required unless LLM_PROVIDER=mock");
  }
  return { ...config, maxUploadBytes: config.MAX_UPLOAD_MB * 1024 * 1024 };
}

/**
 * For CLI runs and local development: loads the nearest `.env` (package dir, then repo root).
 * Variables already set in the environment win. The container gets its env from compose.
 */
export function loadDotEnv(): string | null {
  for (const candidate of [path.resolve(".env"), path.resolve("..", ".env")]) {
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return candidate;
    }
  }
  return null;
}
