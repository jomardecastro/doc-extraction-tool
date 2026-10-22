// Builds the submission archive from the committed tree (so no dependencies, builds, data,
// secrets or evaluation PDFs can slip in; the PDFs are re-downloaded with `pnpm eval:fetch`).
//   pnpm package            -> dist/doc-extraction-tool-<sha>.zip
import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const status = execFileSync("git", ["status", "--porcelain"], { cwd: root }).toString().trim();
if (status) {
  console.error("Working tree has uncommitted changes; commit them first so the archive matches the repository:\n" + status);
  process.exit(1);
}
const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root }).toString().trim();
const outDir = path.join(root, "dist");
mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `doc-extraction-tool-${sha}.zip`);

execFileSync("git", ["archive", "--format=zip", "--prefix=doc-extraction-tool/", "-o", out, "HEAD"], { cwd: root, stdio: "inherit" });
console.log(`wrote ${out} (${(statSync(out).size / 1024 / 1024).toFixed(1)} MB) from commit ${sha}`);
