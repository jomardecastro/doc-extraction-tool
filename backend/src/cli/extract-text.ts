/**
 * Debug/labelling helper: prints what the model would see for a PDF.
 *
 *   pnpm extract-text <file.pdf>            page-tagged text (main + appendix pages)
 *   pnpm extract-text <file.pdf> --all      include administrative pages too
 *   pnpm extract-text <file.pdf> --blocks   raw block list with roles, one line per block
 *   pnpm extract-text <file.pdf> --pages    one line per page: role, size, first headings
 *   pnpm extract-text <file.pdf> --json     the full ExtractedDocument as JSON
 *
 * Stats always go to stderr so stdout can be redirected into a file for gold labelling.
 */
import { readFile } from "node:fs/promises";
import { extractDocument, serializeDocument } from "../pdf/index.js";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("usage: extract-text <file.pdf> [--all] [--blocks] [--json]");
  process.exit(2);
}

const started = Date.now();
const data = new Uint8Array(await readFile(file));
const doc = await extractDocument(data, {
  onPage: (done, total) => {
    if (done % 25 === 0 || done === total) process.stderr.write(`  pages ${done}/${total}\n`);
  },
});

if (args.includes("--json")) {
  process.stdout.write(JSON.stringify(doc, null, 2));
} else if (args.includes("--pages")) {
  for (const page of doc.pages) {
    const headings = page.blocks
      .filter((b) => b.type === "heading")
      .map((b) => b.text.slice(0, 40));
    const role = `${page.role}${page.roleReason ? `: ${page.roleReason}` : ""}`;
    console.log(
      `p${String(page.pageNumber).padStart(3)} ${role.padEnd(32)} ${String(page.chars).padStart(5)}ch ${String(page.blocks.length).padStart(3)}bl | ${headings.slice(0, 3).join(" / ")}`,
    );
  }
} else if (args.includes("--blocks")) {
  for (const page of doc.pages) {
    console.log(
      `\n=== page ${page.pageNumber} [${page.role}${page.roleReason ? `: ${page.roleReason}` : ""}]`,
    );
    for (const b of page.blocks) {
      const role = b.role ? ` {${b.role}}` : "";
      const level = b.type === "heading" || b.type === "bullet" ? `${b.level}` : "";
      console.log(
        `${b.type.padEnd(9)}${level.padEnd(2)} x=${b.x0.toFixed(0).padStart(3)} fs=${b.fontSize.toFixed(1)}${b.bold ? " B" : "  "}${role} | ${b.text.slice(0, 110).replace(/\n/g, " ⏎ ")}`,
      );
    }
  }
} else {
  process.stdout.write(
    serializeDocument(
      doc,
      args.includes("--all") ? { roles: ["main", "supporting", "administrative"] } : {},
    ),
  );
  process.stdout.write("\n");
}

const s = doc.stats;
console.error(
  `\n[${file}] ${s.pageCount} pages, ${s.textChars} chars, body ${s.bodyFontSize}pt, ${s.headings} headings, ${s.bullets} bullets, ${s.tables} tables, ` +
    `${s.administrativePages} admin pages, ${s.supportingPages} appendix pages, dropped ${s.droppedHeaderFooterLines} header/footer lines, ${doc.sections.length} sections, ${Date.now() - started} ms`,
);
