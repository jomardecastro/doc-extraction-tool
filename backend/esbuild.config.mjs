// Bundles the backend into one ESM file. Third-party packages stay external (pdf.js in
// particular ships worker and font files that must be loaded from node_modules); the workspace
// package @det/shared is TypeScript source, so it is inlined here.
import { build } from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const external = Object.keys(pkg.dependencies).filter((name) => name !== "@det/shared");

await build({
  entryPoints: ["src/server.ts"],
  outfile: "dist/server.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: true,
  external,
  logLevel: "info",
});
