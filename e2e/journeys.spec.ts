import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * The journeys a reviewer takes, driven like a person would at desktop and phone widths:
 * land on the upload page, open a bundled plan, read the report, check a quote, export;
 * upload a PDF of their own; hit the error states and find the way back.
 */
const LIVE = Boolean(process.env.E2E_BASE_URL);
const SAMPLE_PDF = path.resolve("backend/samples/dry_creek_9ke_2017.pdf");
const CATEGORIES = [
  "Goals",
  "BMPs",
  "Implementation",
  "Monitoring",
  "Outreach",
  "Geographic areas",
];

async function openReport(page: Page, sampleTitle: string) {
  await page.goto("/");
  await page.getByRole("button", { name: `Open ${sampleTitle}` }).click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Items extracted")).toBeVisible({ timeout: 90_000 });
}

test("the upload page offers one primary action, the bundled plans and the provider in use", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Extract the substance of a watershed plan" }),
  ).toBeVisible();
  // The hidden file input carries the same accessible name, so target the visible button.
  await expect(page.locator("button", { hasText: "Choose a PDF" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Open / })).toHaveCount(5);
  await expect(page.getByRole("contentinfo")).toContainText(/mock provider|claude-/);
  await expect(page.getByRole("link", { name: "Source code (zip)" })).toHaveAttribute(
    "href",
    /\/submission\/doc-extraction-tool\.zip$/,
  );
});

test("a bundled plan opens into the report, every category has a tab, a row shows its quote, and the exports download", async ({
  page,
}, testInfo) => {
  await openReport(page, "Dry Creek Watershed 9 Key Element Plan");
  await page.screenshot({ path: testInfo.outputPath("report.png"), fullPage: true });

  await expect(page.getByRole("tab")).toHaveText(CATEGORIES.map((c) => new RegExp(`^${c}`)));
  let rowsSeen = 0;
  for (const name of CATEGORIES) {
    await page.getByRole("tab", { name: new RegExp(`^${name}`) }).click();
    const panel = page.getByRole("tabpanel");
    if (await panel.getByText("Nothing in this category").isVisible()) continue;
    const rows = await panel.getByRole("button", { expanded: false }).count();
    expect(rows, `${name} has rows`).toBeGreaterThan(0);
    rowsSeen += rows;
  }
  expect(rowsSeen).toBeGreaterThan(0);

  await page.getByRole("tab", { name: /^Goals/ }).click();
  const panel = page.getByRole("tabpanel");
  await panel.getByRole("button", { expanded: false }).first().click();
  // The table (desktop) and the card list (phone) both render the open row; one is display:none.
  await expect(panel.locator("blockquote").filter({ visible: true })).toBeVisible();
  await expect(panel).toContainText("quote found verbatim in the PDF");
  await page.screenshot({ path: testInfo.outputPath("row-open.png") });

  await page.locator("summary", { hasText: "Export" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "JSON (full report)" }).click(),
  ]);
  const report = JSON.parse(await readFile((await download.path())!, "utf8")) as {
    goals: unknown[];
    document: { pages: number };
  };
  expect(Array.isArray(report.goals)).toBe(true);
  expect(report.document.pages).toBeGreaterThan(0);
  for (const [label, type] of [
    ["CSV (one sheet)", "text/csv"],
    ["Excel (sheet per category)", "application/vnd.openxmlformats"],
  ] as const) {
    const href = await page.getByRole("link", { name: label }).getAttribute("href");
    const res = await page.request.get(href!);
    expect(res.ok(), label).toBe(true);
    expect(res.headers()["content-type"], label).toContain(type);
  }

  await page.getByRole("link", { name: "Back to the upload page" }).click();
  await expect(
    page.getByRole("heading", { name: "Extract the substance of a watershed plan" }),
  ).toBeVisible();
});

test("uploading a plan shows progress, lands on the report and is remembered on the upload page", async ({
  page,
}) => {
  test.skip(LIVE, "bills the model on a deployed demo; runs against the local mock server");
  await page.goto("/");
  await page.getByLabel("Choose a PDF").setInputFiles(SAMPLE_PDF);
  await expect(page).toHaveURL(/\/documents\//, { timeout: 30_000 });
  await expect(page.getByText("Items extracted")).toBeVisible({ timeout: 120_000 });
  await page.goto("/");
  await expect(page.getByText("dry_creek_9ke_2017.pdf")).toBeVisible();
});

test("a file that is not a PDF is refused before anything is uploaded", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Choose a PDF").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("this is not a pdf"),
  });
  await expect(page.getByText("That file is not a PDF")).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose another" })).toBeVisible();
});

test("an expired or wrong document link explains itself and offers the way back", async ({
  page,
}) => {
  await page.goto("/documents/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("alert")).toContainText("This document is no longer available");
  await expect(page.getByRole("link", { name: "Upload a document" })).toBeVisible();
});

test("an unknown address offers the upload page", async ({ page }) => {
  await page.goto("/nothing-here");
  await expect(page.getByText("There is nothing at this address")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to the upload page" })).toBeVisible();
});
