// Shared harness: serves the real index.html with a small test hook injected,
// so specs can drive the app through its UI and read internal state, while the
// shipped file stays untouched.
const fs = require("fs");
const path = require("path");
const base = require("@playwright/test");

const ROOT = path.resolve(__dirname, "..", "..");
const ORIGIN = "http://apme.test";

// The hook goes right after this line inside the app's boot handler, where
// every internal below is in scope. If the line changes, fail loudly here
// instead of producing confusing "undefined" errors in every spec.
const ANCHOR = '    markSaved();   /* the empty starting canvas is "clean" */';
const HOOK = `
    window.__apme = {
      get network() { return network; },
      get nodes() { return nodes; },
      get edges() { return edges; },
      loadMermaid: loadMermaid,
      exportMermaid: exportMermaid,
      markSaved: markSaved,
      hasUnsavedChanges: hasUnsavedChanges,
      flushAutosave: flushAutosave,
      readAutosave: readAutosave,
      autoLayout: autoLayout,
      edgeIsDotted: edgeIsDotted
    };`;

let patchedHtml = null;
function patchedIndex() {
  if (patchedHtml) return patchedHtml;
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const hits = html.split(ANCHOR).length - 1;
  if (hits !== 1) {
    throw new Error(`test hook anchor found ${hits} times in index.html (expected 1): ${ANCHOR.trim()}`);
  }
  patchedHtml = html.replace(ANCHOR, ANCHOR + HOOK);
  return patchedHtml;
}

function readRepoFile(name) {
  return fs.readFileSync(path.join(ROOT, name), "utf8");
}

const test = base.test.extend({
  // `app` = the page with the editor loaded. Fails the test if the app logged
  // any console error or threw an uncaught exception.
  app: async ({ page }, use) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    // Let reloads through the "unsaved changes" prompt; dismiss anything else.
    page.on("dialog", (d) => (d.type() === "beforeunload" ? d.accept() : d.dismiss()));

    const html = patchedIndex();
    await page.route(`${ORIGIN}/**`, (route) =>
      route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html })
    );
    await page.goto(`${ORIGIN}/`);
    await page.waitForFunction(() => !!window.__apme);

    await use(page);

    base.expect(errors, "console errors / uncaught exceptions").toEqual([]);
  },
});

/** Load Mermaid text through the app's real importer. */
async function loadMermaid(page, text, filename = "test.md") {
  await page.evaluate(([t, f]) => window.__apme.loadMermaid(t, f), [text, filename]);
}

/** Page coordinates of a node's centre, for real mouse clicks. */
async function nodePagePos(page, id) {
  return page.evaluate((nid) => {
    const net = window.__apme.network;
    const p = net.getPositions([nid])[nid];
    const d = net.canvasToDOM(p);
    const r = document.getElementById("network").getBoundingClientRect();
    return { x: r.left + d.x, y: r.top + d.y };
  }, id);
}

/** Id of the node with the given label (throws if missing or ambiguous). */
async function nodeIdByLabel(page, label) {
  return page.evaluate((l) => {
    const hits = window.__apme.nodes.get({ filter: (n) => n.label === l });
    if (hits.length !== 1) throw new Error(`expected one node labelled "${l}", found ${hits.length}`);
    return hits[0].id;
  }, label);
}

/** Type a label into the open inline editor and commit it with Enter. */
async function typeLabel(page, label) {
  const editor = page.locator("#inline-editor");
  await base.expect(editor).toBeFocused();
  await page.keyboard.type(label);
  await page.keyboard.press("Enter");
  await base.expect(editor).toBeHidden();
}

module.exports = {
  test,
  expect: base.expect,
  loadMermaid,
  nodePagePos,
  nodeIdByLabel,
  typeLabel,
  readRepoFile,
  AUTOSAVE_KEY: "apme:autosave:v1",
};
