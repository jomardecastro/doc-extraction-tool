// Downloads the evaluation and stress-test PDFs from the MDEQ watershed plan index into eval/docs/.
// The files are public Mississippi state documents; they are not committed (see .gitignore).
// Usage: node eval/fetch.mjs [--stress]   (stress adds the 18 MB and 62 MB plans)

import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE =
  "https://www.mdeq.ms.gov/wp-content/uploads/SurfaceWaterBasinMgtNonPointSourceBranch/Watershed_Plans/";

/** slug -> path under BASE. Slugs double as gold-set ids (eval/gold/<slug>.json). */
export const EVAL_DOCS = {
  steele_bayou_2009: "Group_II/YZ/Watershed_Plans/Steele_Bayou_Watershed_Plan_2009.pdf",
  yazoo_pass_9ke_2021: "Group_II/YZ/Nine_Key_Element_Plans/Yazoo_Pass_9_Key_Element_Plan_2021.pdf",
  dry_creek_9ke_2017: "Group_IV/PA/Nine_Key_Element_Plans/Dry_Creek_9_Key_Element_Plan_2017.pdf",
  bell_creek_muddy_creek_2012:
    "Group_I/NI/Watershed_Plans/Bell_Creek_Muddy_Creek_Watershed_Plan_2012.pdf",
  old_fort_bayou_2019: "Group_IV/CS/Watershed_Plans/Old_Fort_Bayou_Watershed_Plan_2019.pdf",
};

export const STRESS_DOCS = {
  buttahatchee_2004: "Group_I/TB/Watershed_Plans/Buttahatchee_River_Watershed_Plan_2004.pdf",
  ross_barnett_2011: "Group_III/PL/Watershed_Plans/Ross_Barnett_Reservoir_Watershed_Plan_2011.pdf",
};

const here = path.dirname(fileURLToPath(import.meta.url));
export const DOCS_DIR = path.join(here, "docs");

async function download(slug, rel) {
  const dest = path.join(DOCS_DIR, `${slug}.pdf`);
  if (existsSync(dest) && statSync(dest).size > 0) {
    console.log(`skip   ${slug} (exists)`);
    return;
  }
  const url = BASE + rel;
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (doc-extraction-tool eval fetch)" },
  });
  if (!res.ok || !res.body) throw new Error(`${slug}: HTTP ${res.status} for ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  console.log(`saved  ${slug} (${(statSync(dest).size / 1024 / 1024).toFixed(1)} MB)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(DOCS_DIR, { recursive: true });
  const docs = { ...EVAL_DOCS, ...(process.argv.includes("--stress") ? STRESS_DOCS : {}) };
  let failed = 0;
  for (const [slug, rel] of Object.entries(docs)) {
    try {
      await download(slug, rel);
    } catch (err) {
      failed++;
      console.error(`FAILED ${slug}: ${err instanceof Error ? err.message : err}`);
    }
  }
  process.exit(failed ? 1 : 0);
}
