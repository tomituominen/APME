const { test, expect } = require("../helpers/app");

test("loads cleanly with an empty canvas", async ({ app }) => {
  await expect(app.locator("#empty-hint")).toBeVisible();
  const counts = await app.evaluate(() => ({
    nodes: window.__apme.nodes.length,
    edges: window.__apme.edges.length,
  }));
  expect(counts).toEqual({ nodes: 0, edges: 0 });
});

test("brand links to the GitHub repo in a new tab", async ({ app }) => {
  const brand = app.locator("#toolbar a.brand");
  await expect(brand).toHaveText("Attack Path Map Editor");
  await expect(brand).toHaveAttribute("href", "https://github.com/tomituominen/APME");
  await expect(brand).toHaveAttribute("target", "_blank");
  await expect(brand).toHaveAttribute("rel", /noopener/);
});

test("status pill is hidden at rest and shows after an action", async ({ app }) => {
  const status = app.locator("#status");
  await expect(status).not.toHaveClass(/\bshow\b/);
  await app.keyboard.press("d"); // flip direction flashes a status message
  await expect(status).toHaveClass(/\bshow\b/);
  await expect(status).toContainText("Direction");
});
