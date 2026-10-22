import { mkdir } from "node:fs/promises";
import { buildApp } from "./app.js";
import { loadConfig, loadDotEnv } from "./config.js";

if (process.env.NODE_ENV !== "production") loadDotEnv();
const config = loadConfig();
await mkdir(config.DATA_DIR, { recursive: true });

const app = await buildApp(config);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    app.log.info({ signal }, "shutting down");
    void app.close().then(() => process.exit(0));
  });
}

try {
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  app.log.info(
    {
      provider: config.LLM_PROVIDER,
      model: config.LLM_MODEL,
      version: config.APP_VERSION,
      dataDir: config.DATA_DIR,
    },
    "DocExtract API ready",
  );
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
