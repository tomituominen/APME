// Save and Open through the real UI. The test page is not a secure context,
// so these exercise the fallback paths (filename prompt + download, hidden
// file input), which is also what Firefox, Safari and file:// users get.
const fs = require("fs");
const { test, expect, loadMermaid, onDialog, readRepoFile } = require("../helpers/app");

const SAMPLE = readRepoFile("sample-graph.md");

test("Save downloads the exported Mermaid file", async ({ app }) => {
  await loadMermaid(app, SAMPLE, "sample-graph.md");
  onDialog(app, (d) => (d.type() === "prompt" ? d.accept("my-map.md") : d.dismiss()));

  const [download] = await Promise.all([
    app.waitForEvent("download"),
    app.locator("#btn-save").click(),
  ]);
  expect(download.suggestedFilename()).toBe("my-map.md");
  const saved = fs.readFileSync(await download.path(), "utf8");
  expect(saved).toBe(await app.evaluate(() => window.__apme.exportMermaid()));
  expect(await app.evaluate(() => window.__apme.hasUnsavedChanges())).toBe(false);
});

test("Open loads the file chosen in the file picker", async ({ app }) => {
  await app.locator("#file-input").setInputFiles({
    name: "sample-graph.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(SAMPLE),
  });
  await expect.poll(() => app.evaluate(() => window.__apme.nodes.length)).toBe(6);
  await expect(app.locator("#status")).toContainText("Loaded sample-graph.md");
});
