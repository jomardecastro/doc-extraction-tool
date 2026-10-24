import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end journeys (see TESTING.md). By default the config builds the app and runs it with
 * the mock provider on a local port, so the suite needs no API key and runs in CI. Set
 * E2E_BASE_URL to run the read-only journeys against a deployed demo instead; the upload
 * journey skips itself there because it would bill the model.
 */
const LIVE = process.env.E2E_BASE_URL;
const PORT = 3131;
const baseURL = LIVE ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? "line" : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: LIVE
    ? undefined
    : {
        command:
          "pnpm build && rm -rf backend/public && cp -r frontend/dist backend/public && node backend/dist/server.js",
        url: `${baseURL}/api/health`,
        reuseExistingServer: false,
        timeout: 300_000,
        env: {
          PORT: String(PORT),
          NODE_ENV: "production",
          LLM_PROVIDER: "mock",
          DATA_DIR: path.resolve(".e2e-data/data"),
          UPLOADS_PER_HOUR_PER_IP: "100",
          DAILY_USD_CAP: "25",
          SOURCE_ZIP_URL: `${baseURL}/submission/doc-extraction-tool.zip`,
        },
      },
});
