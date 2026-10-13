# Attack Path Map Editor

[![Tests](https://github.com/tomituominen/APME/actions/workflows/test.yml/badge.svg)](https://github.com/tomituominen/APME/actions/workflows/test.yml)

A self-contained, single-file HTML5 tool for visualising and editing attack path
maps. Opens directly in any modern browser — no install, no server, no internet
access needed at runtime. Saves and loads in **Mermaid** format, wrapped in a
Markdown code block so committed files render as a diagram on GitHub.

## Run it

- **Hosted:** open <https://tomituominen.github.io/APME/> — nothing to install;
  it runs entirely in your browser, and because it's served over HTTPS the
  native Save/Open dialogs work in Chromium.
- **Locally:** clone or download the repo and open `index.html` (e.g. `open
  index.html`). For the native Save/Open dialogs, serve the folder instead
  (see the tip below).

> **Tip:** double-clicking the file (a `file://` page) works fully, but the
> native Save/Open *dialogs* (pick name + location, overwrite-in-place) need a
> secure context — serve the folder over `localhost`/HTTPS in a Chromium
> browser (e.g. `python3 -m http.server`). On `file://`, Firefox, or Safari,
> Save falls back to a filename prompt + download.

## Two ways to build a map

This tool is meant to be used either way:

- **Manually**, in the editor — draw the graph by hand with the keyboard
  shortcuts and mouse gestures below, then **Save**. This is the primary,
  install-free workflow.
- **Via the included Claude skill** — the repo ships
  [`attack-path-map.skill`](attack-path-map.skill), a [Claude
  Code](https://claude.com/claude-code) skill that generates a properly
  formatted APME `.md` from a described threat (a root outcome plus its attack
  paths). The output opens straight in the editor and renders on GitHub, so
  you can generate a first draft with Claude and then refine it by hand. Drag
  the `.skill` file into Claude Code (or place it in your skills directory) to
  install it. Its source lives unzipped in
  [`skills/attack-path-map/`](skills/attack-path-map/) (instructions plus a
  worked example); after editing it, run `skills/build.sh` to rebuild the
  `.skill`. The test suite fails if the two drift apart.

## Example

The repo ships [`sample-graph.md`](sample-graph.md) — open it in the editor.
Because the file is a fenced Mermaid block, GitHub renders it as a diagram;
here is `sample-graph.md`:

```mermaid
%%{init: {"flowchart": {"curve": "bumpX"}}}%%
flowchart RL
  n2(("Unwanted business outcome"))
  n4[("Cylinder asset")]
  n5["Square asset"]
  n6(("Round asset"))
  n7["Internal user"]
  n8["External user"]
  n2 -.-|"Action"| n4
  n2 ---|"Process"| n5
  n2 ---|"API"| n6
  n4 -.- n7
  n5 --- n8
  n6 --- n8
  linkStyle default stroke:#cccccc,stroke-width:7.5px;
  style n2 fill:#b3434a,stroke:#c67277,color:#ecf0f6
  style n4 fill:#008038,stroke:#40a06a,color:#ecf0f6
  style n5 fill:#b35c00,stroke:#c68540,color:#ecf0f6
  style n6 fill:#877200,stroke:#a59540,color:#ecf0f6
  style n7 fill:#156dbc,stroke:#5092cd,color:#ecf0f6
  style n8 fill:#6a737d,stroke:#8f969e,color:#ecf0f6
```

## Keyboard shortcuts

| Key             | Action                                          |
| --------------- | ----------------------------------------------- |
| **N**           | New free-floating node                          |
| **Tab**         | Chain a new node off the selected one (Shift+Tab reverses the edge) |
| **Enter**       | Sibling — new node sharing parents              |
| **C**           | Connect — then click a target node to draw an edge |
| **E**           | Add / edit the note on the selected node        |
| **← ↑ → ↓**     | Move the selection to the nearest node          |
| **R**           | Rename selected node                            |
| **Del** / **Backspace** | Delete selected (with cascade)          |
| **D**           | Flip layout direction (LR ↔ RL)                 |
| **A**           | Auto layout — un-pin everything, reflow, and fit |
| **F**           | Fit the whole graph to the viewport             |
| **⌘/Ctrl+S**    | Save (hold **Shift** for Save As)               |
| **⌘/Ctrl+Z**    | Undo (one step per action, last 100 steps)      |
| **⌘/Ctrl+Shift+Z** / **Ctrl+Y** | Redo                           |
| **Esc**         | Cancel any inline editor or gesture             |

Undo covers every edit, one step per action: a new node together with its
label, a whole drag, a delete with everything it cascaded to. Selecting,
panning and zooming aren't steps. Inside the label and note editors,
⌘/Ctrl+Z undoes your typing instead. New, Open and crash recovery start a
fresh history; it's kept in memory only, not saved with the file.

### Mouse gestures

- **Drag a line** — bend it (smooth quadratic Bezier; the click point follows
  the cursor).
- **Double-click a line** — toggle solid / dotted. New lines start **dotted**
  (the dotted "attack path" line is the common case); double-click to make one
  solid. Opened files keep whatever style they were saved with.
- **Right-click a node** — colour swatches, a shape toggle (box / database
  cylinder / circle), and the **Note** action. (The master's shape is fixed,
  so its picker omits the shape row.)
- **Right-click a line** — open the edge label editor.
- **Drag a node** — "pin" it; the auto-layout will leave that node alone
  thereafter (until auto layout — the **A** key — un-pins everything).

## File format

Saved files are Markdown with a fenced Mermaid block:

````markdown
# Attack Path Map

```mermaid
%%{init: {"flowchart": {"curve": "bumpX"}}}%%
%% APM-DATA: {"v":1,"dir":"RL","master":"m","pos":{...},"bends":{...},"notes":{...}}
flowchart RL
  m(("Master"))
  a["Phishing email"]
  b["Foothold"]
  m --- a
  a ---|"creds"| b
  linkStyle default stroke:#cccccc,stroke-width:7.5px;

  style a fill:#3a7a4a,stroke:#6b9b77,color:#ecf0f6
```
````

What's standard Mermaid vs. APM-specific:

- **Mermaid-native**: node shapes — `["label"]` box, `[("label")]` database
  cylinder, `(("label"))` circle (the master is always a circle, recorded by
  id in `APM-DATA.master` so a regular circle isn't mistaken for it),
  edges (`---` solid, `-.-` dotted, `|"label"|` annotation), `style` directives
  for fill colours, a `linkStyle default` for line colour + width, and an
  `%%{init: {flowchart: {curve}}}%%` directive for the line-curve style (chosen
  in the toolbar). Anything in the body renders identically in any Mermaid
  viewer (GitHub, mermaid.live, etc.); on re-import the loader reads the curve
  back into the dropdown and ignores `linkStyle`.
- **APM-DATA comment**: a single `%% APM-DATA: { ... JSON ... }` line carries
  the bits Mermaid can't represent — absolute node positions, parametric edge
  bends, hover notes. Mermaid (and GitHub's renderer) ignore `%%` lines, so
  the diagram renders correctly elsewhere; opening the file back in this tool
  restores full fidelity.

### Notes on GitHub

A node's hover note is also surfaced for readers who don't have the tool:

- The noted node gets a footnote marker appended to its label (`Web server ①`).
- A `click` directive links the node to its note anchor — this jumps to the
  note in loose-security viewers (mermaid.live, VS Code, self-hosted docs).
  GitHub sandboxes the diagram in an iframe and runs Mermaid in strict mode,
  so the click is inert there — harmless, just not interactive.
- A `## Notes` section below the diagram lists every note as plain Markdown,
  keyed by the same marker. **This is always visible on GitHub**, so the note
  text is never lost to readers.

On re-import the tool reads notes from the authoritative `APM-DATA` block,
strips the markers off the labels, and ignores the `click` lines and the
`## Notes` section — so the round-trip stays lossless.

The loader also accepts plain Mermaid (no Markdown wrapper) — useful for
pasting from `mermaid.live` or hand-written diagrams.

## Toolbar

| Control      | What it does                                                |
| ------------ | ----------------------------------------------------------- |
| **New**      | Clear the canvas                                            |
| **Open**     | Open a Mermaid `.md` / `.mmd` / `.mermaid` file             |
| **Save**     | Save the graph (also **⌘/Ctrl+S**); **Shift** = Save As     |
| **Export**   | Export the whole graph as a PNG image (see below)            |
| **Curve ▾**  | Line-curve style written into the saved Mermaid (`bumpX` default). Only affects how the saved file renders elsewhere (GitHub/mermaid.live), not the editor. Opening a file adopts its curve. |

Save and Open use the browser's native file dialogs via the **File System
Access API** where available (Chromium served over `localhost`/HTTPS): you
pick the name and location, and a later **Save** overwrites the same file in
place. Where that API isn't available — Firefox, Safari, or the page opened
straight off `file://` — Open falls back to the OS file picker and Save
prompts for a filename, then downloads the `.md` (the name is remembered for
next time).

**Export** opens a small panel: pick **Dark** (as on screen) or **Light**
(print-friendly, white background), then **Download** the PNG or **Copy** it
to the clipboard for pasting into slides, documents or chat. The image always
holds the whole graph at 2x resolution, whatever the current zoom (very large
graphs are scaled down to stay within browser canvas limits). Nodes with notes
get numbered badges, and the notes are listed under the graph with the same
numbers the saved file uses. Copying images needs a secure page (the hosted
site, `localhost` or HTTPS); opened straight off `file://`, **Copy** downloads
the PNG instead. The chosen theme is remembered in this browser.

Fit and auto-layout are keyboard-only: **F** fits the graph to the
viewport, **A** runs auto layout (un-pin everything, reflow, fit).

## Auto-save & crash recovery

The working graph is continuously mirrored to the browser's `localStorage`, so
a crash, an accidental tab close, or a power loss can't destroy unsaved work —
there's nothing to switch on.

- The draft is written ~0.8 s after any change (and flushed immediately when
  the tab is hidden or closed), so at most about a second of work is ever at
  risk. The payload is the exact same Mermaid text **Save** writes, so a
  recovered draft is loss-free (positions, bends, notes, colours, curve, and
  direction all survive).
- A draft is kept **only while there are unsaved changes**. The moment the
  graph matches the last Save/Open/New, the draft is dropped — so a stale draft
  never shadows a file you've already saved.
- On the next launch, if a draft survived, a small banner offers **Restore** or
  **Discard**. It's non-blocking — the canvas is usable behind it. Restored
  work stays marked unsaved so you're nudged to **Save** it to a real file.
- This is a safety net, not a substitute for saving: it lives in one browser
  profile on one machine, holds a single most-recent draft, and is cleared by
  **Discard** or by the browser clearing site data. If `localStorage` is
  unavailable (e.g. locked-down private mode), auto-save silently does nothing.
- **Privacy:** the draft is stored unencrypted and is readable by any page on
  the same origin. On the hosted version that's every GitHub Pages site under
  `tomituominen.github.io`; when opened as a local file in Chrome, it's every
  other local HTML file you open. If a map is sensitive, **Save** it (which
  drops the draft) or **Discard** the recovery prompt rather than leaving
  unsaved work behind.

## Notes on the implementation

- Rendering engine: [vis-network](https://github.com/visjs/vis-network) (v9.x,
  minified copy inlined in the HTML — no external requests at runtime).
- Everything that relies on vis-network internals (node geometry, forcing a
  re-measure) lives in one "VIS-NETWORK ADAPTER" section of `index.html`; the
  rest uses the public API. When upgrading vis-network, run
  `tests/specs/adapter.spec.js` first: it checks exactly those assumptions.
- Custom drawing layers (in `beforeDrawing` / `afterDrawing` canvas hooks):
  dot grid backdrop, master aura, selection/hover edge glow, bent edges, node
  gradient/highlight pass, database cylinders, soft note glow on noted nodes,
  and edge labels.
- No build step. Edit the HTML in place; refresh the browser.

## Development: running the tests

A headless browser suite ([Playwright](https://playwright.dev)) lives in
`tests/`. It is dev-only: `index.html` stays a single self-contained file, and
the tests load it unmodified (a small hook is injected at load time to read
internal state).

```bash
cd tests
npm install
npx playwright install chromium   # one-time, downloads ~100 MB
npm test
```

It covers the Mermaid round-trip (positions, bends, notes, colours, curve,
direction), solid/dotted edge handling, auto-save and crash recovery, and
collision-free auto layout. Run it before committing changes to `index.html`;
GitHub Actions also runs it on every push to `main` and on pull requests.

## License

Released under the [Don't Be A Dick Public License](LICENSE.md) (DBAD, v1.1):
do whatever you like with it — just don't be a dick. See [`LICENSE.md`](LICENSE.md)
for the full text.
