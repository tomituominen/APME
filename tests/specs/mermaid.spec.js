const { test, expect, loadMermaid, readRepoFile } = require("../helpers/app");

const SAMPLE = readRepoFile("sample-graph.md");

// Positions and bends recorded in sample-graph.md's APM-DATA line.
const SAMPLE_POS = {
  n2: [0, 0], n4: [-390, -227], n5: [-390, -27],
  n6: [-390, 173], n7: [-770, -235], n8: [-770, 65],
};
const SAMPLE_BENDS = {
  "n2|n4": [-0.0741, 0.3825],
  "n2|n5": [-0.0181, 0.0348],
  "n2|n6": [-0.0486, -0.3349],
};

/** Snapshot of everything the round-trip must preserve. */
function snapshot(page) {
  return page.evaluate(() => {
    const A = window.__apme;
    const pos = A.network.getPositions();
    const nodes = {};
    A.nodes.forEach((n) => {
      nodes[n.id] = {
        label: n.label,
        // Boxes inherit shape from the global node options, so unset = box.
        shape: n._db ? "database" : (n.shape || "box"),
        master: !!n._master,
        note: n._note || null,
        x: Math.round(pos[n.id].x),
        y: Math.round(pos[n.id].y),
      };
    });
    const edges = {};
    A.edges.forEach((e) => {
      edges[`${e.from}|${e.to}`] = {
        label: e.label || null,
        dotted: A.edgeIsDotted(e),
        bend: e._bend ? [e._bend.u, e._bend.v] : null,
      };
    });
    return { nodes, edges, curve: document.getElementById("curve-select").value };
  });
}

test("sample graph loads with every property intact", async ({ app }) => {
  await loadMermaid(app, SAMPLE, "sample-graph.md");
  const s = await snapshot(app);

  expect(Object.keys(s.nodes).sort()).toEqual(["n2", "n4", "n5", "n6", "n7", "n8"]);
  for (const [id, [x, y]] of Object.entries(SAMPLE_POS)) {
    expect(Math.abs(s.nodes[id].x - x), `${id}.x`).toBeLessThanOrEqual(1);
    expect(Math.abs(s.nodes[id].y - y), `${id}.y`).toBeLessThanOrEqual(1);
  }

  expect(s.nodes.n2).toMatchObject({ label: "Unwanted business outcome", shape: "circle", master: true });
  expect(s.nodes.n4.shape).toBe("database");
  expect(s.nodes.n5.shape).toBe("box");
  expect(s.nodes.n6).toMatchObject({ shape: "circle", master: false });

  // Footnote markers (①②) are a GitHub-only aid; they must not leak into labels.
  expect(s.nodes.n5).toMatchObject({ label: "Square asset", note: "Important note about the asset" });
  expect(s.nodes.n7).toMatchObject({ label: "Internal user", note: "Important note about the user" });
  expect(s.nodes.n8.note).toBeNull();

  expect(s.edges["n2|n4"]).toMatchObject({ label: "Action", dotted: true });
  expect(s.edges["n2|n5"]).toMatchObject({ label: "Process", dotted: false });
  expect(s.edges["n4|n7"]).toMatchObject({ dotted: true });
  expect(s.edges["n5|n8"]).toMatchObject({ dotted: false });
  for (const [key, [u, v]] of Object.entries(SAMPLE_BENDS)) {
    expect(s.edges[key].bend[0], `${key} bend u`).toBeCloseTo(u, 3);
    expect(s.edges[key].bend[1], `${key} bend v`).toBeCloseTo(v, 3);
  }

  expect(s.curve).toBe("bumpX");
});

test("export then re-import is lossless and stable", async ({ app }) => {
  await loadMermaid(app, SAMPLE, "sample-graph.md");
  const before = await snapshot(app);
  const first = await app.evaluate(() => window.__apme.exportMermaid());

  await loadMermaid(app, first, "roundtrip.md");
  const after = await snapshot(app);
  const second = await app.evaluate(() => window.__apme.exportMermaid());

  expect(after).toEqual(before);
  expect(second).toBe(first);
});

test("export carries colours, direction, curve and GitHub notes", async ({ app }) => {
  await loadMermaid(app, SAMPLE, "sample-graph.md");
  const md = await app.evaluate(() => window.__apme.exportMermaid());

  expect(md).toContain('"curve": "bumpX"');
  expect(md).toMatch(/^flowchart RL$/m);
  expect(md).toContain("style n2 fill:#b3434a");
  expect(md).toContain("style n4 fill:#008038");
  expect(md).toContain("style n6 fill:#c4a81a");
  expect(md).toMatch(/^\s*n2 -\.-\|"Action"\| n4$/m);
  expect(md).toMatch(/^\s*n2 ---\|"Process"\| n5$/m);
  expect(md).toContain("## Notes");
  expect(md).toContain("Important note about the asset");
});

test("plain Mermaid without APM-DATA loads and gets laid out", async ({ app }) => {
  await loadMermaid(app, 'flowchart LR\n  a["One"]\n  b["Two"]\n  c["Three"]\n  a --> b\n  a -.- c\n');
  const s = await snapshot(app);

  expect(Object.keys(s.nodes).sort()).toEqual(["a", "b", "c"]);
  expect(s.edges["a|b"].dotted).toBe(false);
  expect(s.edges["a|c"].dotted).toBe(true);
  const spots = new Set(Object.values(s.nodes).map((n) => `${n.x},${n.y}`));
  expect(spots.size, "every node gets its own position").toBe(3);
});

test("malformed APM-DATA is ignored rather than breaking the import", async ({ app }) => {
  await loadMermaid(app, 'flowchart RL\n%% APM-DATA: {not valid json}\n  m(("Root"))\n  x["Leaf"]\n  m --- x\n');
  const s = await snapshot(app);
  expect(Object.keys(s.nodes).sort()).toEqual(["m", "x"]);
  expect(s.edges["m|x"]).toBeDefined();
});
