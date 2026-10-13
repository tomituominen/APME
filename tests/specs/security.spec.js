// Regression tests from the import-path security review. Threat model: a
// crafted .md file is opened in the editor (and possibly re-saved and shared).
const { test, expect, loadMermaid, nodePagePos } = require("../helpers/app");

const PAYLOAD = '<img src=x onerror="window.__pwned=1"><b id="inj">bold</b>';
const MAX_LABEL = 1000;

/** Two-node graph whose second node ("v") carries `note`, with stored positions. */
function graphWithNote(note, label = "Victim") {
  const meta = { v: 1, dir: "RL", master: "m", pos: { m: [0, 0], v: [-400, 0] }, notes: { v: note } };
  return [
    "flowchart RL",
    "%% APM-DATA: " + JSON.stringify(meta),
    '  m(("Root"))',
    '  v["' + label + '"]',
    "  m --- v",
  ].join("\n");
}

function injected(page) {
  return page.evaluate(() => ({
    elements: !!document.getElementById("inj") || document.querySelectorAll("img").length > 0,
    ran: !!window.__pwned,
  }));
}

test.describe("hostile content stays inert", () => {
  test("a note is shown as plain text in the hover popup", async ({ app }) => {
    await loadMermaid(app, graphWithNote(PAYLOAD));
    await app.waitForTimeout(150);
    const p = await nodePagePos(app, "v");
    await app.mouse.move(p.x - 5, p.y - 5);
    await app.mouse.move(p.x, p.y);
    const tip = app.locator(".vis-tooltip");
    await expect(tip).toBeVisible();
    await expect(tip).toHaveText(PAYLOAD);
    expect(await tip.evaluate((el) => el.children.length)).toBe(0);
    expect(await injected(app)).toEqual({ elements: false, ran: false });
  });

  test("an HTML label only reaches the canvas and the editor's value", async ({ app }) => {
    await loadMermaid(app, graphWithNote("n", PAYLOAD.replace(/"/g, "#quot;")));
    await app.evaluate(() => window.__apme.network.selectNodes(["v"]));
    await app.keyboard.press("r");
    await expect(app.locator("#inline-editor")).toHaveValue(PAYLOAD);
    expect(await injected(app)).toEqual({ elements: false, ran: false });
  });

  test("re-saving drops foreign click links and Mermaid init settings", async ({ app }) => {
    await loadMermaid(app, [
      '%%{init: {"securityLevel": "loose", "themeCSS": "body{background:url(https://evil.example/x)}", "flowchart": {"curve": "bumpX"}}}%%',
      "flowchart RL",
      '  m(("Root"))',
      '  a["A"]',
      "  m --- a",
      '  click a "javascript:alert(1)" "x"',
      '  click m href "https://evil.example"',
    ].join("\n"));
    const md = await app.evaluate(() => window.__apme.exportMermaid());
    for (const bad of ["javascript:", "evil.example", "loose", "themeCSS"]) {
      expect(md, bad).not.toContain(bad);
    }
  });
});

test.describe("hostile input can't freeze the tab", () => {
  test("over-long labels are capped on import", async ({ app }) => {
    const big = "x".repeat(200000);
    const text = [
      "flowchart RL",
      `  m(("${big}"))`,
      `  a["${big}"]`,
      `  b[("${big}")]`,
      `  c[${big}]`,
      `  m ---|"${big}"| a`,
      `  m --- b`,
      `  m --- c`,
      `  m --- ${"y".repeat(200000)}`, // a bare id doubles as the label
    ].join("\n");
    const ms = await app.evaluate((t) => {
      const t0 = performance.now();
      window.__apme.loadMermaid(t, "big.md");
      return performance.now() - t0;
    }, text);
    expect(ms, "load time (ms)").toBeLessThan(3000);

    const lengths = await app.evaluate(() => ({
      nodes: window.__apme.nodes.map((n) => n.label.length),
      edges: window.__apme.edges.map((e) => (e.label || "").length),
    }));
    expect(lengths.nodes).toHaveLength(5);
    for (const len of lengths.nodes) expect(len).toBeLessThanOrEqual(MAX_LABEL);
    expect(Math.max(...lengths.edges)).toBe(MAX_LABEL);
    await expect(app.locator("#status")).toContainText("truncated");
  });

  test("the label editor caps pasted input at the same length", async ({ app }) => {
    await app.keyboard.press("n");
    await expect(app.locator("#inline-editor")).toBeFocused();
    await app.keyboard.insertText("x".repeat(MAX_LABEL + 500)); // behaves like a paste
    await app.keyboard.press("Enter");
    expect(await app.evaluate(() => window.__apme.nodes.get()[0].label.length)).toBe(MAX_LABEL);
  });
});

test.describe("saved files keep their data intact", () => {
  test("notes with U+2028 / U+2029 survive save and reopen", async ({ app }) => {
    const note = "a}\u2028b\u2029c";
    await loadMermaid(app, graphWithNote("placeholder"));
    await app.evaluate((n) => window.__apme.nodes.update({ id: "v", _note: n, title: n }), note);
    const md = await app.evaluate(() => window.__apme.exportMermaid());
    expect(md).not.toMatch(/[\u2028\u2029]/);

    await loadMermaid(app, md);
    const r = await app.evaluate(() => ({
      note: window.__apme.nodes.get("v")._note,
      x: Math.round(window.__apme.network.getPositions(["v"]).v.x),
    }));
    expect(r).toEqual({ note, x: -400 });
  });

  test("files saved by older versions with a raw U+2028 still load their metadata", async ({ app }) => {
    // JSON.stringify leaves U+2028 unescaped, exactly as the old exporter did.
    await loadMermaid(app, graphWithNote("old}\u2028note"));
    const r = await app.evaluate(() => ({
      note: window.__apme.nodes.get("v")._note,
      x: Math.round(window.__apme.network.getPositions(["v"]).v.x),
    }));
    expect(r).toEqual({ note: "old}\u2028note", x: -400 });
  });

  test("labels containing Mermaid escape sequences round-trip exactly", async ({ app }) => {
    const labels = [
      'say #quot;hi#quot; then "quoted"',
      "C# & a<b>c, #35; and &amp; and &lt;",
      "literal <br/> tag",
      "two\nlines",
    ];
    await loadMermaid(app, 'flowchart RL\n  m(("M"))\n  a["A"]\n  b["B"]\n  c["C"]\n  m --- a\n  m --- b\n  m --- c\n');
    await app.evaluate((ls) => {
      ["m", "a", "b", "c"].forEach((id, i) => window.__apme.nodes.update({ id, label: ls[i] }));
    }, labels);
    const md = await app.evaluate(() => window.__apme.exportMermaid());
    await loadMermaid(app, md);
    const after = await app.evaluate(() => ["m", "a", "b", "c"].map((id) => window.__apme.nodes.get(id).label));
    expect(after).toEqual(labels);
  });

  test("node ids that match Object.prototype names import as visible nodes", async ({ app }) => {
    // vis-network silently drops such ids from its node index (never drawn),
    // and an edge to one used to crash the import. Metadata keyed by the
    // original id (position, note) must still apply after the rename.
    const meta = { v: 1, dir: "RL", master: "m", pos: { constructor: [-400, -150] }, notes: { toString: "kept" } };
    const text = [
      "flowchart RL",
      "%% APM-DATA: " + JSON.stringify(meta),
      '  m(("M"))',
      '  constructor["C"]',
      '  toString["T"]',
      "  m --- constructor",
      "  m --- toString",
      "  constructor --- valueOf",
      "  toString --- hasOwnProperty",
    ].join("\n");

    // Everything below is keyed by label: what the user sees.
    const view = () => app.evaluate(() => {
      const A = window.__apme;
      const pos = A.network.getPositions();
      return {
        drawn: A.network.body.nodeIndices.length,
        edges: A.edges.length,
        nodes: A.nodes.map((n) => [n.label, pos[n.id] ? Math.round(pos[n.id].x) : null,
                                   pos[n.id] ? Math.round(pos[n.id].y) : null, n._note || null]),
      };
    });

    await loadMermaid(app, text);
    const s = await view();
    expect(s.drawn, "every node is indexed (drawn) by vis-network").toBe(5);
    expect(s.edges).toBe(4);
    const byLabel = new Map(s.nodes.map(([label, x, y, note]) => [label, { x, y, note }]));
    expect([...byLabel.keys()].sort()).toEqual(["C", "M", "T", "hasOwnProperty", "valueOf"]);
    expect(byLabel.get("C")).toMatchObject({ x: -400, y: -150 });  // stored position applied
    expect(byLabel.get("T").note).toBe("kept");                    // stored note applied
    // Levels: M | C, T | valueOf, hasOwnProperty
    expect(byLabel.get("valueOf").x).toBe(byLabel.get("hasOwnProperty").x);
    expect(byLabel.get("valueOf").x).toBeLessThan(byLabel.get("T").x);

    // Save and reopen: same picture.
    const md = await app.evaluate(() => window.__apme.exportMermaid());
    await loadMermaid(app, md);
    expect(await view()).toEqual(s);
  });
});

test.describe("content security policy", () => {
  test.use({ allowedConsoleErrors: [/Content Security Policy/i] });

  test("the page can't reach the network", async ({ app }) => {
    // Hermetic: if the policy were missing, these requests would be aborted
    // here rather than sent, and no violation would be reported.
    await app.route("https://example.com/**", (r) => r.abort());
    const violations = await app.evaluate(async () => {
      const seen = [];
      document.addEventListener("securitypolicyviolation", (e) => seen.push(e.effectiveDirective));
      await fetch("https://example.com/data").catch(() => {});
      await new Promise((done) => {
        const img = new Image();
        img.onload = img.onerror = done;
        img.src = "https://example.com/pixel.png";
      });
      await new Promise((r) => setTimeout(r, 50));
      return seen.sort();
    });
    expect(violations).toEqual(["connect-src", "img-src"]);
  });
});
