// Label legibility. Every node uses the SAME label colour (by design: no
// per-node light/dark flipping), so every swatch in the colour menu must be
// dark enough for that one colour. Fails if a palette change makes any
// swatch's labels hard to read.
const { test, expect, loadMermaid, nodePagePos } = require("../helpers/app");

const MIN_CONTRAST = 4.0; // labels are 28 px (WCAG "large text" needs 3:1)

function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test("every swatch gives the same, readable label colour", async ({ app }) => {
  // Eight nodes in a row, far enough apart to right-click each one.
  const ids = ["m", "a", "b", "c", "d", "e", "f", "g"];
  const pos = Object.fromEntries(ids.map((id, i) => [id, [-i * 260, (i % 2) * 140]]));
  const meta = { v: 1, dir: "RL", master: "m", pos };
  await loadMermaid(app, [
    "flowchart RL",
    "%% APM-DATA: " + JSON.stringify(meta),
    '  m(("M"))',
    ...ids.slice(1).map((id) => `  ${id}["${id.toUpperCase()}"]`),
    ...ids.slice(1).map((id) => `  m --- ${id}`),
  ].join("\n"));
  await app.waitForTimeout(150);

  // Apply swatch i to node i through the real right-click menu.
  const swatches = [];
  for (let i = 0; i < ids.length; i++) {
    const p = await nodePagePos(app, ids[i]);
    await app.mouse.click(p.x, p.y, { button: "right" });
    const all = app.locator("#color-picker .swatch");
    if (i === 0) {
      for (const s of await all.all()) swatches.push(await s.getAttribute("data-color"));
      expect(swatches).toHaveLength(ids.length);
    }
    await all.nth(i).click();
  }

  const r = await app.evaluate((nodeIds) => {
    const A = window.__apme;
    return {
      fills: nodeIds.map((id) => {
        const n = A.nodes.get(id);
        return n._bg || (n.color && n.color.background);
      }),
      // The colour vis-network actually paints each label with.
      labelColours: nodeIds.map((id) => A.network.body.nodes[id].options.font.color),
      styleColours: [...A.exportMermaid().matchAll(/^\s*style \S+ .*color:(#[0-9a-f]{6})/gm)].map((m) => m[1]),
    };
  }, ids);

  expect(r.fills).toEqual(swatches);
  const label = r.labelColours[0];
  expect(new Set(r.labelColours), "one label colour on every node").toEqual(new Set([label]));
  expect(new Set(r.styleColours), "exported styles agree").toEqual(new Set([label]));

  for (const fill of swatches) {
    expect(contrast(fill, label), `${label} on ${fill}`).toBeGreaterThanOrEqual(MIN_CONTRAST);
  }
});
