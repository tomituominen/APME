const { test, expect, loadMermaid, nodePagePos, nodeIdByLabel, typeLabel } = require("../helpers/app");

/** Is the edge from→to dotted? Fails if the edge doesn't exist. */
function edgeDotted(page, from, to) {
  return page.evaluate(([f, t]) => {
    const e = window.__apme.edges.get({ filter: (x) => x.from === f && x.to === t })[0];
    if (!e) throw new Error(`no edge ${f} -> ${t}`);
    return window.__apme.edgeIsDotted(e);
  }, [from, to]);
}

test("imported edges keep their saved solid/dotted style", async ({ app }) => {
  await loadMermaid(app, 'flowchart RL\n  m(("M"))\n  a["A"]\n  b["B"]\n  m --- a\n  m -.- b\n');
  expect(await edgeDotted(app, "m", "a")).toBe(false);
  expect(await edgeDotted(app, "m", "b")).toBe(true);
});

test("edges created with Tab, Enter and C are dotted by default", async ({ app }) => {
  // N: first node (becomes the master).
  await app.keyboard.press("n");
  await typeLabel(app, "Root");
  const root = await nodeIdByLabel(app, "Root");

  // Tab: chain a child off the selected node.
  await app.keyboard.press("Tab");
  await typeLabel(app, "Child");
  const child = await nodeIdByLabel(app, "Child");
  expect(await edgeDotted(app, root, child), "Tab edge").toBe(true);

  // Enter: sibling of Child, i.e. another child of Root.
  await app.keyboard.press("Enter");
  await typeLabel(app, "Sibling");
  const sibling = await nodeIdByLabel(app, "Sibling");
  expect(await edgeDotted(app, root, sibling), "Enter edge").toBe(true);

  // C: connect Child -> Sibling by clicking the target node.
  await app.evaluate((id) => window.__apme.network.selectNodes([id]), child);
  await app.keyboard.press("c");
  const target = await nodePagePos(app, sibling);
  await app.mouse.click(target.x, target.y);
  expect(await edgeDotted(app, child, sibling), "C edge").toBe(true);

  // Dotted edges export as Mermaid's dotted connector.
  const md = await app.evaluate(() => window.__apme.exportMermaid());
  expect(md).toMatch(new RegExp(`^\\s*${root} -\\.- ${child}$`, "m"));
  expect(md).toMatch(new RegExp(`^\\s*${child} -\\.- ${sibling}$`, "m"));
});

test("double-clicking an edge toggles it solid", async ({ app }) => {
  await loadMermaid(app, [
    "flowchart RL",
    '%% APM-DATA: {"v":1,"dir":"RL","master":"m","pos":{"m":[0,0],"a":[-500,0]}}',
    '  m(("M"))',
    '  a["A"]',
    "  m -.- a",
  ].join("\n"));
  await app.waitForTimeout(100); // let the post-load fit settle
  expect(await edgeDotted(app, "m", "a")).toBe(true);

  const p = await nodePagePos(app, "m");
  const q = await nodePagePos(app, "a");
  await app.mouse.dblclick((p.x + q.x) / 2, (p.y + q.y) / 2);

  expect(await edgeDotted(app, "m", "a")).toBe(false);
});
