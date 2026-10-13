const { test, expect, loadMermaid, AUTOSAVE_KEY } = require("../helpers/app");

const GRAPH = 'flowchart RL\n  m(("Master"))\n  a["Alpha"]\n  m --- a\n';

function draft(page) {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  }, AUTOSAVE_KEY);
}

/** Load GRAPH, then make an unsaved edit and flush it to storage. */
async function makeDirtyDraft(page, label = "EDITED") {
  await loadMermaid(page, GRAPH, "draft.md");
  await page.evaluate((l) => {
    window.__apme.nodes.update({ id: "a", label: l });
    window.__apme.flushAutosave();
  }, label);
}

test("no draft for an empty canvas or a freshly loaded (clean) graph", async ({ app }) => {
  await app.evaluate(() => window.__apme.flushAutosave());
  expect(await draft(app)).toBeNull();

  await loadMermaid(app, GRAPH, "clean.md");
  await app.evaluate(() => window.__apme.flushAutosave());
  expect(await draft(app)).toBeNull();
});

test("an unsaved edit writes a draft; saving removes it", async ({ app }) => {
  await makeDirtyDraft(app);
  const d = await draft(app);
  expect(d).not.toBeNull();
  expect(d.filename).toBe("draft.md");
  expect(typeof d.savedAt).toBe("number");
  expect(d.mermaid).toContain('a["EDITED"]');

  // markSaved() is what Save/Open/New call: the graph now matches a file.
  await app.evaluate(() => { window.__apme.markSaved(); window.__apme.flushAutosave(); });
  expect(await draft(app)).toBeNull();
});

test("edits are autosaved without an explicit flush (debounced)", async ({ app }) => {
  await loadMermaid(app, GRAPH, "draft.md");
  await app.evaluate(() => window.__apme.nodes.update({ id: "a", label: "DEBOUNCED" }));
  await expect.poll(async () => (await draft(app))?.mermaid ?? "", { timeout: 3000 })
    .toContain('a["DEBOUNCED"]');
});

test("after a reload, Restore brings back the exact unsaved work", async ({ app }) => {
  await makeDirtyDraft(app, "CRASH-EDIT");
  await app.reload();
  await app.waitForFunction(() => !!window.__apme);

  const banner = app.locator("#recovery-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Recovered unsaved work of "draft.md"');
  expect(await app.evaluate(() => window.__apme.nodes.length), "canvas empty until Restore").toBe(0);

  await banner.locator("button.rb-primary").click();
  await expect(banner).toBeHidden();
  const state = await app.evaluate(() => ({
    label: window.__apme.nodes.get("a").label,
    count: window.__apme.nodes.length,
    unsaved: window.__apme.hasUnsavedChanges(),
  }));
  expect(state).toEqual({ label: "CRASH-EDIT", count: 2, unsaved: true });
  await expect(app.locator("#status")).toContainText("Recovered unsaved work");
});

test("Discard drops the draft for good", async ({ app }) => {
  await makeDirtyDraft(app);
  await app.reload();
  await app.waitForFunction(() => !!window.__apme);

  const banner = app.locator("#recovery-banner");
  await banner.locator("button:not(.rb-primary)").click();
  await expect(banner).toBeHidden();
  expect(await draft(app)).toBeNull();
  expect(await app.evaluate(() => window.__apme.nodes.length)).toBe(0);

  await app.reload();
  await app.waitForFunction(() => !!window.__apme);
  await app.waitForTimeout(200); // the banner would appear on a setTimeout(0)
  await expect(banner).toHaveCount(0);
});
