const { test, expect, loadMermaid, typeLabel, nodeIdByLabel } = require("../helpers/app");

// Mixed label lengths and shapes across three levels, no stored positions,
// so everything is placed by the auto-layout engine.
const MIXED = [
  "flowchart RL",
  '  m(("Unwanted outcome"))',
  '  a["Short"]',
  '  b["A considerably longer label that has to wrap across several lines inside its box"]',
  '  c[("Mid-length database")]',
  '  d["D"]',
  '  e["Another fairly long label for a leaf node"]',
  '  f(("Circle"))',
  '  g["G"]',
  '  h["H with some text"]',
  '  i[("Store")]',
  "  m --- a",
  "  m --- b",
  "  m -.- c",
  "  a --- d",
  "  a --- e",
  "  b -.- f",
  "  c --- g",
  "  c --- h",
  "  c --- i",
  "  b --- h",
].join("\n");

/** Pairs of nodes whose drawn bounding boxes intersect. */
function overlaps(page) {
  return page.evaluate(() => {
    const net = window.__apme.network;
    const ids = window.__apme.nodes.getIds();
    const box = Object.fromEntries(ids.map((id) => [id, net.getBoundingBox(id)]));
    // Guard against a vacuous pass: every box must have a real size.
    for (const id of ids) {
      const b = box[id];
      if (!(b.right - b.left > 10 && b.bottom - b.top > 10)) throw new Error(`degenerate bbox for ${id}`);
    }
    const eps = 0.5;
    const hits = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = box[ids[i]], b = box[ids[j]];
        if (a.left < b.right - eps && b.left < a.right - eps &&
            a.top < b.bottom - eps && b.top < a.bottom - eps) hits.push(`${ids[i]}/${ids[j]}`);
      }
    }
    return hits;
  });
}

async function settle(page) {
  // Bounding boxes refresh on the next draw.
  await page.evaluate(() => window.__apme.network.redraw());
  await page.waitForTimeout(100);
}

test("auto layout places mixed-size nodes without overlaps", async ({ app }) => {
  await loadMermaid(app, MIXED);
  await settle(app);
  expect(await overlaps(app)).toEqual([]);

  // Running it again (the A key path) must stay overlap-free.
  await app.evaluate(() => window.__apme.autoLayout());
  await settle(app);
  expect(await overlaps(app)).toEqual([]);
});

test("Enter inserts the new sibling directly below the selected node", async ({ app }) => {
  await loadMermaid(app, 'flowchart RL\n  m(("M"))\n  x["X"]\n  y["Y"]\n  z["Z"]\n  m --- x\n  m --- y\n  m --- z\n');
  const ys = () => app.evaluate(() => {
    const pos = window.__apme.network.getPositions();
    return Object.fromEntries(window.__apme.nodes.map((n) => [n.label, pos[n.id].y]));
  });

  const start = await ys();
  const [top, second, third] = ["X", "Y", "Z"].sort((p, q) => start[p] - start[q]);
  await app.evaluate((id) => window.__apme.network.selectNodes([id]), await nodeIdByLabel(app, top));

  await app.keyboard.press("Enter");
  await typeLabel(app, "New");

  const after = await ys();
  expect(after.New).toBeGreaterThan(after[top]);
  expect(after.New).toBeLessThan(after[second]);
  expect(after[second]).toBeLessThan(after[third]);
  await settle(app);
  expect(await overlaps(app)).toEqual([]);
});
