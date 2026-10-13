// Undo / redo. Every edit is driven through the real UI (keys, right-click
// menu, mouse drags) and compared against the full saved state plus pin flags.
const { test, expect, loadMermaid, nodePagePos, typeLabel, onDialog } = require("../helpers/app");

const UNDO = "ControlOrMeta+z";
const REDO = "ControlOrMeta+Shift+z";
const SETTLE_MS = 450; // let animations (layout: 280 ms) and the post-load fit settle

// m is the master; a and b are its children; c hangs off a. Positions are
// stored. Edges are drawn with "continuous" smoothing, which bows diagonal
// lines away from their chord, so m-b is horizontal: its midpoint is on the
// line, for the click and drag tests.
const BASE = [
  "flowchart RL",
  '%% APM-DATA: {"v":1,"dir":"RL","master":"m","pos":{"m":[0,0],"a":[-450,-220],"b":[-450,0],"c":[-900,-220]}}',
  '  m(("Master"))',
  '  a["Alpha"]',
  '  b["Bravo"]',
  '  c["Charlie"]',
  "  m --- a",
  "  m --- b",
  "  a --- c",
].join("\n");

/** Everything an undo must restore: the saved file text plus pin flags. */
function state(page) {
  return page.evaluate(() => ({
    md: window.__apme.exportMermaid(),
    pinned: window.__apme.nodes.get({ filter: (n) => !!n._pinned }).map((n) => n.id).sort(),
  }));
}

async function select(page, id) {
  await page.evaluate((nid) => window.__apme.network.selectNodes([nid]), id);
}

async function edgeMidpoint(page, from, to) {
  const p = await nodePagePos(page, from);
  const q = await nodePagePos(page, to);
  return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
}

const status = (page) => page.locator("#status");

/** Run `action`, then check it's exactly one undoable, redoable step. */
async function expectOneStep(page, action) {
  const before = await state(page);
  await action();
  await page.waitForTimeout(SETTLE_MS);
  const after = await state(page);
  expect(after, "the action changed something").not.toEqual(before);

  await page.keyboard.press(UNDO);
  await expect(status(page)).toHaveText("Undo");
  expect(await state(page), "undo restores the previous state").toEqual(before);

  await page.keyboard.press(REDO);
  await expect(status(page)).toHaveText("Redo");
  expect(await state(page), "redo restores the edited state").toEqual(after);
}

test.beforeEach(async ({ app }) => {
  await loadMermaid(app, BASE, "base.md");
  await app.waitForTimeout(150); // let the post-load fit settle before mouse work
});

test.describe("each kind of edit is one undoable step", () => {
  test("add a node and type its label (Tab)", async ({ app }) => {
    await expectOneStep(app, async () => {
      await select(app, "a");
      await app.keyboard.press("Tab");
      await app.waitForTimeout(SETTLE_MS); // a person takes longer than the debounce to type
      await typeLabel(app, "Delta");
    });
  });

  test("add a sibling (Enter)", async ({ app }) => {
    await expectOneStep(app, async () => {
      await select(app, "a");
      await app.keyboard.press("Enter");
      await app.waitForTimeout(SETTLE_MS);
      await typeLabel(app, "Echo");
    });
  });

  test("rename (R)", async ({ app }) => {
    await expectOneStep(app, async () => {
      await select(app, "b");
      await app.keyboard.press("r");
      await app.keyboard.press("ControlOrMeta+a");
      await app.waitForTimeout(SETTLE_MS);
      await typeLabel(app, "Renamed");
    });
  });

  test("delete with cascade", async ({ app }) => {
    await expectOneStep(app, async () => {
      await select(app, "a");
      await app.keyboard.press("Delete");
      expect(await app.evaluate(() => window.__apme.nodes.length)).toBe(2); // a and c gone
    });
  });

  test("connect (C)", async ({ app }) => {
    await expectOneStep(app, async () => {
      await select(app, "b");
      await app.keyboard.press("c");
      const t = await nodePagePos(app, "c");
      await app.mouse.click(t.x, t.y);
    });
  });

  test("colour and shape from the right-click menu", async ({ app }) => {
    const p = await nodePagePos(app, "b");
    await expectOneStep(app, async () => {
      await app.mouse.click(p.x, p.y, { button: "right" });
      await app.locator('#color-picker .swatch[data-color="#b35c00"]').click();
    });
    await expectOneStep(app, async () => {
      await app.mouse.click(p.x, p.y, { button: "right" });
      await app.locator('#color-picker .shape-action[data-shape="database"]').click();
    });
  });

  test("note (E)", async ({ app }) => {
    await expectOneStep(app, async () => {
      await select(app, "b");
      await app.keyboard.press("e");
      await expect(app.locator("#note-editor textarea")).toBeFocused();
      await app.waitForTimeout(SETTLE_MS);
      await app.keyboard.type("A hover note");
      await app.keyboard.press("Enter");
    });
  });

  test("toggle a line dotted (double-click)", async ({ app }) => {
    const mid = await edgeMidpoint(app, "m", "b");
    await expectOneStep(app, async () => {
      await app.mouse.dblclick(mid.x, mid.y);
    });
  });

  test("bend a line (drag)", async ({ app }) => {
    const mid = await edgeMidpoint(app, "m", "b");
    await expectOneStep(app, async () => {
      await app.mouse.move(mid.x, mid.y);
      await app.mouse.down();
      await app.mouse.move(mid.x, mid.y - 60, { steps: 6 });
      await app.mouse.move(mid.x, mid.y - 120, { steps: 6 });
      await app.mouse.up();
    });
  });

  test("move a node (drag)", async ({ app }) => {
    const p = await nodePagePos(app, "c");
    await expectOneStep(app, async () => {
      await app.mouse.move(p.x, p.y);
      await app.mouse.down();
      await app.mouse.move(p.x + 60, p.y + 40, { steps: 6 });
      await app.mouse.move(p.x + 120, p.y + 80, { steps: 6 });
      await app.mouse.up();
    });
  });

  test("auto layout (A), flip direction (D) and curve style", async ({ app }) => {
    await expectOneStep(app, () => app.keyboard.press("a"));
    await expectOneStep(app, () => app.keyboard.press("d"));
    await expectOneStep(app, () => app.locator("#curve-select").selectOption("linear"));
  });
});

// Races. These must not call state() between the two actions: exporting
// writes positions back to the DataSet, which would itself record a step and
// hide a missing checkpoint (autosave does the same ~800 ms after a change).
test.describe("quick successive actions stay separate steps", () => {
  test("a bend followed quickly by another edit", async ({ app }) => {
    const s0 = await state(app);
    const mid = await edgeMidpoint(app, "m", "b");
    await app.mouse.move(mid.x, mid.y);
    await app.mouse.down();
    await app.mouse.move(mid.x, mid.y - 120, { steps: 8 });
    await app.mouse.up();
    await app.waitForTimeout(300);           // well before autosave would export
    await app.keyboard.press("d");
    await app.waitForTimeout(SETTLE_MS);

    await app.keyboard.press(UNDO);          // undoes only the flip...
    const s1 = await state(app);
    expect(s1.md).toMatch(/^flowchart RL$/m);
    expect(s1.md, "...so the bend is still there").toContain('"m|b"');
    await app.keyboard.press(UNDO);          // ...then the bend
    expect(await state(app)).toEqual(s0);
  });

  test("auto layout followed quickly by another edit", async ({ app }) => {
    const s0 = await state(app);
    expect(s0.pinned).toHaveLength(4);       // loaded with positions = pinned
    await app.keyboard.press("a");           // un-pins everything, animated reflow
    await app.waitForTimeout(SETTLE_MS);
    await app.keyboard.press("d");
    await app.waitForTimeout(SETTLE_MS);

    await app.keyboard.press(UNDO);          // undoes only the flip...
    const s1 = await state(app);
    expect(s1.md).toMatch(/^flowchart RL$/m);
    expect(s1.pinned, "...so auto layout's un-pinning is kept").toEqual([]);
    await app.keyboard.press(UNDO);
    expect(await state(app)).toEqual(s0);
  });

  test("a keyboard edit followed by a mouse drag", async ({ app }) => {
    await app.keyboard.press("d");           // flip to LR
    await app.waitForTimeout(SETTLE_MS);
    const p = await nodePagePos(app, "c");
    await app.mouse.move(p.x, p.y);
    await app.mouse.down();
    await app.mouse.move(p.x + 80, p.y + 60, { steps: 8 });
    await app.mouse.up();
    await app.waitForTimeout(SETTLE_MS);

    await app.keyboard.press(UNDO);          // undoes only the drag
    expect((await state(app)).md, "the flip is still there").toMatch(/^flowchart LR$/m);
  });

  test("a key pressed while auto layout is still animating", async ({ app }) => {
    // Reference: where auto layout settles when left alone.
    await app.keyboard.press("a");
    await app.waitForTimeout(SETTLE_MS);
    const settled = await state(app);
    await app.keyboard.press(UNDO);

    await app.keyboard.press("a");
    await app.keyboard.press("d");           // within the 280 ms animation
    await app.waitForTimeout(SETTLE_MS);
    await app.keyboard.press(UNDO);          // undoes only the flip...
    expect(await state(app), "...back to the settled layout, not a mid-animation frame").toEqual(settled);
  });

  test("a label committed by clicking away, then a drag", async ({ app }) => {
    await select(app, "a");
    await app.keyboard.press("Tab");
    await expect(app.locator("#inline-editor")).toBeFocused();
    await app.keyboard.type("Foxtrot");      // no Enter: the click below commits it
    const p = await nodePagePos(app, "b");
    await app.mouse.move(p.x, p.y);
    await app.mouse.down();
    await app.mouse.move(p.x + 80, p.y + 60, { steps: 8 });
    await app.mouse.up();
    await app.waitForTimeout(SETTLE_MS);

    await app.keyboard.press(UNDO);          // undoes only the drag
    const labels = await app.evaluate(() => window.__apme.nodes.map((n) => n.label));
    expect(labels, "the committed node survives").toContain("Foxtrot");
  });
});

// Every key press starts a new action, so a stray key during a drag must not
// split it into a half-finished step.
test.describe("a key pressed mid-drag doesn't split the drag", () => {
  test("node drag", async ({ app }) => {
    const s0 = await state(app);
    const p = await nodePagePos(app, "c");
    await app.mouse.move(p.x, p.y);
    await app.mouse.down();
    await app.mouse.move(p.x + 60, p.y + 40, { steps: 6 });
    await app.keyboard.press("Shift");
    await app.mouse.move(p.x + 160, p.y + 100, { steps: 6 });
    await app.mouse.up();
    await app.waitForTimeout(SETTLE_MS);

    await app.keyboard.press(UNDO);
    expect(await state(app), "back to before the drag, not mid-drag").toEqual(s0);
  });

  test("bend drag", async ({ app }) => {
    const s0 = await state(app);
    const mid = await edgeMidpoint(app, "m", "b");
    await app.mouse.move(mid.x, mid.y);
    await app.mouse.down();
    await app.mouse.move(mid.x, mid.y - 60, { steps: 6 });
    await app.keyboard.press("Shift");
    await app.mouse.move(mid.x, mid.y - 140, { steps: 6 });
    await app.mouse.up();
    await app.waitForTimeout(SETTLE_MS);

    await app.keyboard.press(UNDO);
    expect(await state(app), "back to before the bend, not mid-bend").toEqual(s0);
  });
});

test("Ctrl+Y redoes too", async ({ app }) => {
  await select(app, "b");
  await app.keyboard.press("Delete");
  await app.waitForTimeout(SETTLE_MS);
  const edited = await state(app);
  await app.keyboard.press(UNDO);
  await app.keyboard.press("Control+y");
  expect(await state(app)).toEqual(edited);
});

test("an action is undoable immediately, without waiting", async ({ app }) => {
  const before = await state(app);
  await select(app, "b");
  await app.keyboard.press("Delete");
  await app.keyboard.press(UNDO); // straight after the action
  expect(await state(app)).toEqual(before);
});

test("several actions undo one at a time, in reverse order", async ({ app }) => {
  const s0 = await state(app);
  await select(app, "b");
  await app.keyboard.press("Delete");
  await app.waitForTimeout(SETTLE_MS);
  const s1 = await state(app);
  await app.keyboard.press("d");
  await app.waitForTimeout(SETTLE_MS);

  await app.keyboard.press(UNDO);
  expect(await state(app)).toEqual(s1);
  await app.keyboard.press(UNDO);
  expect(await state(app)).toEqual(s0);
  await app.keyboard.press(UNDO);
  await expect(status(app)).toHaveText("Nothing to undo");
  expect(await state(app)).toEqual(s0);
});

test("a new action after undo clears redo", async ({ app }) => {
  await select(app, "b");
  await app.keyboard.press("Delete");
  await app.waitForTimeout(SETTLE_MS);
  await app.keyboard.press(UNDO);
  await app.keyboard.press("d");
  await app.waitForTimeout(SETTLE_MS);
  const flipped = await state(app);

  await app.keyboard.press(REDO);
  await expect(status(app)).toHaveText("Nothing to redo");
  expect(await state(app)).toEqual(flipped);
});

test("a cancelled new node leaves nothing to undo", async ({ app }) => {
  const before = await state(app);
  await select(app, "a");
  await app.keyboard.press("Tab");
  await expect(app.locator("#inline-editor")).toBeFocused();
  await app.keyboard.press("Escape");
  await app.waitForTimeout(SETTLE_MS);
  expect(await state(app)).toEqual(before);

  await app.keyboard.press(UNDO);
  await expect(status(app)).toHaveText("Nothing to undo");
  expect(await state(app)).toEqual(before);
});

test("the shortcut edits text inside the label editor, not the graph", async ({ app }) => {
  await select(app, "b");
  await app.keyboard.press("r");
  const editor = app.locator("#inline-editor");
  await expect(editor).toBeFocused();
  await app.keyboard.type("XYZ");
  await app.keyboard.press(UNDO);
  await expect(editor).toBeFocused();
  await expect(status(app)).not.toHaveText(/Undo|Nothing to undo/);
  expect(await app.evaluate(() => window.__apme.nodes.length)).toBe(4);
});

test("undoing back to the saved state makes the document clean", async ({ app }) => {
  const dirty = () => app.evaluate(() => window.__apme.hasUnsavedChanges());
  expect(await dirty()).toBe(false);
  await select(app, "b");
  await app.keyboard.press("Delete");
  await app.waitForTimeout(SETTLE_MS);
  expect(await dirty()).toBe(true);
  await app.keyboard.press(UNDO);
  expect(await dirty()).toBe(false);
});

test("undo restores pin flags, so layout keeps re-flowing unpinned nodes", async ({ app }) => {
  // Plain Mermaid without positions: nothing is pinned.
  await loadMermaid(app, 'flowchart RL\n  m(("M"))\n  x["X"]\n  y["Y"]\n  m --- x\n  m --- y\n');
  await app.waitForTimeout(150);
  const before = await state(app);
  expect(before.pinned).toEqual([]);

  const p = await nodePagePos(app, "x");
  await app.mouse.move(p.x, p.y);
  await app.mouse.down();
  await app.mouse.move(p.x + 100, p.y + 100, { steps: 8 });
  await app.mouse.up();
  await app.waitForTimeout(SETTLE_MS);
  expect((await state(app)).pinned).toEqual(["x"]);

  await app.keyboard.press(UNDO);
  expect(await state(app)).toEqual(before);
});

test("Open and New start a fresh history", async ({ app }) => {
  await select(app, "b");
  await app.keyboard.press("Delete");
  await app.waitForTimeout(SETTLE_MS);

  await app.locator("#file-input").setInputFiles({
    name: "other.md", mimeType: "text/markdown",
    buffer: Buffer.from('flowchart RL\n  q(("Q"))\n  r["R"]\n  q --- r\n'),
  });
  await expect.poll(() => app.evaluate(() => window.__apme.nodes.length)).toBe(2);
  const opened = await state(app);
  await app.keyboard.press(UNDO);
  await expect(status(app)).toHaveText("Nothing to undo");
  expect(await state(app)).toEqual(opened);

  onDialog(app, (d) => (d.type() === "confirm" ? d.accept() : d.dismiss()));
  await app.locator("#btn-new").click();
  await app.locator("#btn-new").blur();
  expect(await app.evaluate(() => window.__apme.nodes.length)).toBe(0);
  await app.keyboard.press(UNDO);
  await expect(status(app)).toHaveText("Nothing to undo");
  expect(await app.evaluate(() => window.__apme.nodes.length)).toBe(0);
});

test("history keeps the last 100 steps", async ({ app }) => {
  const undone = await app.evaluate(() => {
    const A = window.__apme;
    for (let i = 1; i <= 105; i++) {
      A.nodes.update({ id: "b", label: "step " + i });
      A.checkpoint();
    }
    let n = 0;
    const label = () => A.nodes.get("b").label;
    for (let guard = 0; guard < 200; guard++) {
      const before = label();
      A.undo();
      if (document.getElementById("status").textContent === "Nothing to undo") break;
      if (label() !== before) n++;
    }
    return { n, finalLabel: label() };
  });
  // 100 steps back from "step 105" lands on "step 5"; the base state is gone.
  expect(undone).toEqual({ n: 100, finalLabel: "step 5" });
});
