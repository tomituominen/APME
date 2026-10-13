// Contract tests for the vis-network adapter in index.html, the only code
// that touches vis-network internals. After upgrading the inlined
// vis-network, run these first: a failure here names the broken assumption
// directly instead of surfacing as odd glows, rings or layout spacing.
const { test, expect, loadMermaid } = require("../helpers/app");

const GRAPH = [
  "flowchart RL",
  '%% APM-DATA: {"v":1,"dir":"RL","master":"m","pos":{"m":[0,0],"b":[-400,-150],"d":[-400,150]}}',
  '  m(("Master"))',
  '  b["A box with a fairly long label"]',
  '  d[("A cylinder")]',
  "  m --- b",
  "  m --- d",
].join("\n");

async function settle(page) {
  await page.evaluate(() => window.__apme.network.redraw());
  await page.waitForTimeout(100);
}

test("visNodeGeometry matches vis-network's public API for every shape", async ({ app }) => {
  await loadMermaid(app, GRAPH);
  await settle(app);
  const r = await app.evaluate(() => {
    const A = window.__apme;
    const out = {};
    for (const id of ["m", "b", "d"]) {
      out[id] = {
        g: A.visNodeGeometry(id),
        pos: A.network.getPositions([id])[id],
        pub: A.network.getBoundingBox(id),
      };
    }
    return out;
  });

  for (const [id, { g, pos, pub }] of Object.entries(r)) {
    expect(g, `${id}: geometry`).not.toBeNull();
    expect(g.x, `${id}: x`).toBeCloseTo(pos.x, 5);
    expect(g.y, `${id}: y`).toBeCloseTo(pos.y, 5);
    expect(g.width, `${id}: width`).toBeGreaterThan(10);
    expect(g.height, `${id}: height`).toBeGreaterThan(10);
    // The internal bbox is what vis-network's public getBoundingBox reports.
    for (const side of ["left", "right", "top", "bottom"]) {
      expect(g.bbox[side], `${id}: bbox.${side}`).toBeCloseTo(pub[side], 1);
    }
  }
  expect(r.m.g.radius, "circle radius").toBeGreaterThan(10);
});

test("visNodeGeometry returns null for ids vis-network doesn't know", async ({ app }) => {
  await loadMermaid(app, GRAPH);
  const r = await app.evaluate(() => ({
    missing: window.__apme.visNodeGeometry("no-such-node"),
    protoName: window.__apme.visNodeGeometry("constructor"),
  }));
  expect(r).toEqual({ missing: null, protoName: null });
});

test("visRemeasureNodes makes vis-network resize every node", async ({ app }) => {
  // vis-network's emitter has no listener introspection, and v9 already
  // re-measures on label/font changes, so check the effect directly: the
  // internal "_resizeNodes" event must call each node's resize().
  await loadMermaid(app, GRAPH);
  const calls = await app.evaluate(() => {
    const A = window.__apme;
    const reg = A.network.body.nodes;
    const counts = {};
    const originals = {};
    for (const id of ["m", "b", "d"]) {
      counts[id] = 0;
      originals[id] = reg[id].resize;
      reg[id].resize = function () { counts[id]++; return originals[id].apply(this, arguments); };
    }
    try { A.visRemeasureNodes(); } finally {
      for (const id of ["m", "b", "d"]) reg[id].resize = originals[id];
    }
    return counts;
  });
  expect(calls).toEqual({ m: 1, b: 1, d: 1 });
});

test("viewSize matches the canvas vis-network draws on", async ({ app }) => {
  const r = await app.evaluate(() => {
    const c = document.querySelector("#network canvas");
    return { view: window.__apme.viewSize(), canvas: { width: c.clientWidth, height: c.clientHeight } };
  });
  expect(r.view.width).toBeGreaterThan(0);
  expect(r.view).toEqual(r.canvas);
});

test("visRedrawNow draws synchronously, before returning", async ({ app }) => {
  // Image export resizes the canvas, draws, copies the pixels and restores
  // it all in one go, so the draw must happen inside the call, not on the
  // next animation frame.
  await loadMermaid(app, GRAPH);
  const draws = await app.evaluate(() => {
    const A = window.__apme;
    let n = 0;
    const count = () => { n++; };
    A.network.on("afterDrawing", count);
    try { A.visRedrawNow(); return n; } finally { A.network.off("afterDrawing", count); }
  });
  expect(draws).toBe(1);
});
