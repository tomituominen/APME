// The Claude skill in skills/attack-path-map/ and the packaged
// attack-path-map.skill. Whatever the skill tells Claude to write must load
// cleanly in the editor, and the committed archive must match its source.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { test, expect, loadMermaid, readRepoFile } = require("../helpers/app");

const ROOT = path.resolve(__dirname, "..", "..");
const SRC = path.join(ROOT, "skills", "attack-path-map");
const ARCHIVE = path.join(ROOT, "attack-path-map.skill");

/** Load `text` and report what a user would see, plus a save/reopen check. */
async function inspect(page, text) {
  await loadMermaid(page, text, "skill.md");
  await page.evaluate(() => window.__apme.network.redraw());
  await page.waitForTimeout(150);
  const r = await page.evaluate(() => {
    const A = window.__apme, net = A.network, ids = A.nodes.getIds();
    const box = Object.fromEntries(ids.map((id) => [id, net.getBoundingBox(id)]));
    let overlaps = 0;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = box[ids[i]], b = box[ids[j]];
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlaps++;
    }
    return {
      nodes: ids.length,
      edges: A.edges.length,
      notes: A.nodes.get({ filter: (n) => !!n._note }).length,
      pinned: A.nodes.get({ filter: (n) => !!n._pinned }).length,
      masters: A.nodes.get({ filter: (n) => !!n._master }).map((n) => n.id),
      labels: Object.fromEntries(A.nodes.map((n) => [n.id, n.label])),
      overlaps,
      md: A.exportMermaid(),
    };
  });
  await loadMermaid(page, r.md, "roundtrip.md");
  r.roundTripStable = (await page.evaluate(() => window.__apme.exportMermaid())) === r.md;
  return r;
}

test("the bundled example loads cleanly", async ({ app }) => {
  const r = await inspect(app, fs.readFileSync(path.join(SRC, "example.md"), "utf8"));
  expect(r).toMatchObject({ nodes: 10, edges: 9, notes: 2, pinned: 0, overlaps: 0, masters: ["n1"], roundTripStable: true });
  // Markers are stripped on load; the escaped quotes decode.
  expect(r.labels.n2).toBe("Customer database");
  expect(r.labels.n6).toBe("Deployment configuration");
  expect(r.labels.n8).toBe('Admin "break-glass" account');
});

test("the template inside SKILL.md loads cleanly", async ({ app }) => {
  const skill = fs.readFileSync(path.join(SRC, "SKILL.md"), "utf8");
  const m = /^````markdown\n([\s\S]*?)\n````$/m.exec(skill);
  expect(m, "SKILL.md has a ````markdown template block").not.toBeNull();
  const r = await inspect(app, m[1]);
  expect(r).toMatchObject({ nodes: 3, edges: 2, notes: 1, pinned: 0, overlaps: 0, masters: ["n1"], roundTripStable: true });
});

test("attack-path-map.skill matches skills/attack-path-map/ (run skills/build.sh)", async () => {
  const listed = execFileSync("unzip", ["-Z1", ARCHIVE], { encoding: "utf8" }).split("\n").filter(Boolean).sort();
  const files = fs.readdirSync(SRC).filter((f) => f !== ".DS_Store").sort();
  expect(listed).toEqual(["attack-path-map/", ...files.map((f) => `attack-path-map/${f}`)].sort());
  for (const f of files) {
    const packed = execFileSync("unzip", ["-p", ARCHIVE, `attack-path-map/${f}`]);
    expect(packed.equals(fs.readFileSync(path.join(SRC, f))), `${f} differs from the archive`).toBe(true);
  }
});
