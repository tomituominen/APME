// PNG image export: whole graph at 2x regardless of zoom, dark or light
// theme, numbered note badges with a Notes legend underneath, downloaded or
// copied to the clipboard. Exporting must never disturb the view, the
// selection, or the graph itself.
const { test, expect, loadMermaid, readRepoFile } = require("../helpers/app");

const SAMPLE = readRepoFile("sample-graph.md");
const BG = { dark: [0x14, 0x17, 0x1c], light: [0xff, 0xff, 0xff] };
const BADGE = { dark: [0xec, 0xf0, 0xf6], light: [0x1b, 0x1f, 0x24] };

/** Width and height from a PNG's IHDR chunk. */
function pngSize(buf) {
  expect(buf.subarray(0, 8).toString("hex"), "PNG signature").toBe("89504e470d0a1a0a");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Render an export in the page; returns its size, the requested pixels, a
    checksum of every pixel, and the distinct colours in the top-left
    120x120 px corner (pure background in every test graph). */
function render(page, theme, pixels = []) {
  return page.evaluate(([t, px]) => {
    const c = window.__apme.renderExportImage(t);
    if (!c) return null;
    const ctx = c.getContext("2d");
    const all = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < all.length; i++) sum = (sum * 31 + all[i]) | 0;
    const corner = ctx.getImageData(0, 0, 120, 120).data;
    const colours = new Set();
    for (let i = 0; i < corner.length; i += 4) colours.add(corner[i] + "," + corner[i + 1] + "," + corner[i + 2]);
    return {
      width: c.width,
      height: c.height,
      checksum: sum,
      corner: [...colours],
      pixels: px.map(([x, y]) => Array.from(ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3))),
    };
  }, [theme, pixels]);
}

function close(a, b, tol = 6) {
  return a.every((v, i) => Math.abs(v - b[i]) <= tol);
}

async function openPanel(page) {
  await page.click("#btn-export");
  await expect(page.locator("#export-panel")).toBeVisible();
}

test("Download saves a PNG named after the graph file", async ({ app }) => {
  await loadMermaid(app, SAMPLE, "sample-graph.md");
  const expected = await render(app, "dark");

  await openPanel(app);
  const [download] = await Promise.all([
    app.waitForEvent("download"),
    app.click("#export-panel .ep-download"),
  ]);
  expect(download.suggestedFilename()).toBe("sample-graph.png");
  const buf = require("fs").readFileSync(await download.path());
  expect(pngSize(buf)).toEqual({ width: expected.width, height: expected.height });
  await expect(app.locator("#export-panel")).toBeHidden();
  await expect(app.locator("#status")).toContainText("Exported sample-graph.png");
});

test("the whole graph is exported at 2x whatever the zoom", async ({ app }) => {
  await loadMermaid(app, SAMPLE, "sample-graph.md");
  const bounds = await app.evaluate(() => window.__apme.exportBounds({ aura: true }));
  const fitted = await render(app, "dark");
  await app.evaluate(() => window.__apme.network.moveTo({ position: { x: 900, y: -700 }, scale: 0.15 }));
  const zoomedOut = await render(app, "dark");
  await app.evaluate(() => window.__apme.network.moveTo({ position: { x: 0, y: 0 }, scale: 3 }));
  const zoomedIn = await render(app, "dark");

  expect(fitted.width).toBe(Math.round(bounds.w * 2));
  for (const r of [zoomedOut, zoomedIn]) {
    expect({ width: r.width, height: r.height }).toEqual({ width: fitted.width, height: fitted.height });
    expect(r.checksum, "identical pixels at any zoom").toBe(fitted.checksum);
  }
});

for (const theme of ["dark", "light"]) {
  test(`${theme} theme: background and numbered note badges`, async ({ app }) => {
    await loadMermaid(app, SAMPLE, "sample-graph.md");
    // Where badge 1 (on n5, a box) lands in the image: its bbox's top-right.
    const spot = await app.evaluate((t) => {
      const A = window.__apme;
      A.renderExportImage(t);   /* measures nodes the same way the next render does */
      const b = A.exportBounds({ aura: t === "dark" });
      const bb = A.visNodeGeometry("n5").bbox;
      const left = b.cx - b.w / 2, top = b.cy - b.h / 2;
      // A point inside the badge circle, clear of its digit.
      return { x: (bb.right - 4 - 10 - left) * 2, y: (bb.top + 4 - top) * 2 };
    }, theme);
    const r = await render(app, theme, [[1, 1], [spot.x, spot.y]]);
    // Plain background: no on-screen dot grid.
    expect(r.corner).toEqual([BG[theme].join(",")]);
    expect(close(r.pixels[1], BADGE[theme], 20), `badge ${r.pixels[1]}`).toBe(true);
  });
}

test("notes add a legend below the graph", async ({ app }) => {
  await loadMermaid(app, SAMPLE, "sample-graph.md");
  const withNotes = await render(app, "light");
  await app.evaluate(() => {
    const A = window.__apme;
    A.nodes.update([{ id: "n5", _note: "" }, { id: "n7", _note: "" }]);
  });
  const without = await render(app, "light");
  const bounds = await app.evaluate(() => window.__apme.exportBounds({ aura: false }));

  expect(without.height).toBe(Math.round(bounds.h * 2));
  expect(withNotes.height).toBeGreaterThan(without.height + 2 * 100);
});

test("exporting leaves the view, selection and graph untouched", async ({ app }) => {
  await loadMermaid(app, SAMPLE, "sample-graph.md");
  await app.waitForTimeout(150);   /* let the load's own fit-to-view run first */
  await app.evaluate(() => {
    const net = window.__apme.network;
    net.selectNodes(["n5"]);
    net.moveTo({ position: { x: -200, y: 40 }, scale: 0.8 });
  });
  const state = () => app.evaluate(() => {
    const net = window.__apme.network;
    const v = net.getViewPosition();
    return {
      x: Math.round(v.x), y: Math.round(v.y), scale: net.getScale(),
      selected: net.getSelectedNodes(),
      size: window.__apme.viewSize(),
      md: window.__apme.exportMermaid(),
    };
  });
  const before = await state();
  expect(before.selected).toEqual(["n5"]);

  await openPanel(app);
  await Promise.all([app.waitForEvent("download"), app.click("#export-panel .ep-download")]);
  expect(await state()).toEqual(before);

  // No undo step either: a freshly loaded graph has nothing to undo, and
  // the export must not have added anything.
  await app.evaluate(() => window.__apme.undo());
  expect((await state()).md).toBe(before.md);
});

test("an empty canvas exports nothing", async ({ app }) => {
  await openPanel(app);
  await app.click("#export-panel .ep-download");
  await expect(app.locator("#status")).toContainText("Nothing to export");
});

test("the panel toggles, closes on Escape and remembers the theme", async ({ app }) => {
  const panel = app.locator("#export-panel");
  await openPanel(app);
  await app.click("#btn-export");
  await expect(panel).toBeHidden();

  await openPanel(app);
  await expect(panel.locator('input[value="dark"]')).toBeChecked();
  await panel.locator('input[value="light"]').check();
  await app.keyboard.press("Escape");
  await expect(panel).toBeHidden();

  await app.reload();
  await app.waitForFunction(() => !!window.__apme);
  await openPanel(app);
  await expect(panel.locator('input[value="light"]')).toBeChecked();
});

test.describe("on a secure origin", () => {
  test.use({ origin: "http://localhost:4173" });

  test("Copy puts the PNG on the clipboard", async ({ app, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:4173" });
    await loadMermaid(app, SAMPLE, "sample-graph.md");
    const expected = await render(app, "dark");
    await openPanel(app);
    await app.click("#export-panel .ep-copy");
    await expect(app.locator("#status")).toContainText("Image copied");

    const size = await app.evaluate(async () => {
      const items = await navigator.clipboard.read();
      const blob = await items[0].getType("image/png");
      const bmp = await createImageBitmap(blob);
      return { width: bmp.width, height: bmp.height };
    });
    expect(size).toEqual({ width: expected.width, height: expected.height });
  });
});

test("Copy falls back to a download where the clipboard is unavailable", async ({ app }) => {
  await loadMermaid(app, SAMPLE, "sample-graph.md");
  expect(await app.evaluate(() => window.isSecureContext)).toBe(false);
  await openPanel(app);
  const [download] = await Promise.all([
    app.waitForEvent("download"),
    app.click("#export-panel .ep-copy"),
  ]);
  expect(download.suggestedFilename()).toBe("sample-graph.png");
  await expect(app.locator("#status")).toContainText("downloaded instead");
});
