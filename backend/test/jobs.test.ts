import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

/**
 * Temp uploads live in DATA_DIR/tmp only while a job needs them. Every exit (done, failed,
 * rejected before a job exists, orphaned by a crash) must leave the directory empty, or a
 * demo box fills up with reviewers' 100 MB PDFs.
 */
describe("temp uploads", () => {
  let dataDir: string;
  let tmpDir: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), "docextract-jobs-"));
    tmpDir = path.join(dataDir, "tmp");
    await mkdir(tmpDir, { recursive: true });
    await writeFile(path.join(tmpDir, "orphan-from-a-crash.pdf"), "%PDF-1.4 leftover");
    app = await buildApp(
      loadConfig({
        NODE_ENV: "test",
        LLM_PROVIDER: "mock",
        DATA_DIR: dataDir,
        UPLOADS_PER_HOUR_PER_IP: "100",
      }),
    );
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  async function waitForJob(id: string): Promise<{ status: string; error: unknown }> {
    for (let i = 0; i < 300; i++) {
      const res = await app.inject({ method: "GET", url: `/api/documents/${id}` });
      const job = res.json() as { status: string; error: unknown };
      if (job.status === "done" || job.status === "failed") return job;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`job ${id} never finished`);
  }

  function multipartPdf(
    filename: string,
    body: Buffer,
  ): { headers: Record<string, string>; payload: Buffer } {
    const boundary = "----docextract-test-boundary";
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`,
      ),
      body,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return { headers: { "content-type": `multipart/form-data; boundary=${boundary}` }, payload };
  }

  it("sweeps orphaned uploads at startup", async () => {
    expect(await readdir(tmpDir)).toEqual([]);
  });

  it("removes the upload once a job completes", async () => {
    const res = await app.inject({ method: "POST", url: "/api/samples/dry-creek-2017/process" });
    expect(res.statusCode).toBe(202);
    const { id } = res.json() as { id: string };
    const job = await waitForJob(id);
    expect(job.status).toBe("done");
    expect(await readdir(tmpDir)).toEqual([]);
  });

  it("removes the upload when a job fails", async () => {
    // Passes the magic-byte check, then fails inside the PDF parser.
    const garbage = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(4096, 0x41)]);
    const res = await app.inject({
      method: "POST",
      url: "/api/documents",
      ...multipartPdf("broken.pdf", garbage),
    });
    expect(res.statusCode).toBe(202);
    const { id } = res.json() as { id: string };
    const job = await waitForJob(id);
    expect(job.status).toBe("failed");
    expect(await readdir(tmpDir)).toEqual([]);
  });

  it("removes the upload when the file is rejected before a job exists", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/documents",
      ...multipartPdf("notes.txt", Buffer.from("this is not a pdf")),
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    expect(await readdir(tmpDir)).toEqual([]);
  });
});
