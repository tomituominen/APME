# Visual backlog

Candidate visual / UX polish items for `apme.html`. Each is
independent — pick any subset. Implementation notes are sized for the
existing architecture (vis-network + custom `beforeDrawing` /
`afterDrawing` canvas hooks; no build step).

## Shipped

- [x] Background dot grid (`drawDotGrid`, 40-unit spacing, 13% white)
- [x] Radial vignette overlay (`#canvas-wrap::after`)
- [x] Master node aura (`drawMasterAura`, colour follows master fill)
- [x] Per-node gradient + top-edge highlight (`drawNodeShinePass`)
- [x] Animated layout transitions on Beautify (`animateNodesTo`, eased 280 ms)
- [x] Corner dot note badge (`drawNoteIndicators`)
- [x] Cursor variety (grab / pointer / grabbing / crosshair via `.hover-*` classes)
- [x] Brand dot pulse (`#toolbar .brand::before`, `brand-pulse` keyframes,
  5 s opacity 0.55 ↔ 0.9)
- [x] Status pill animation (`#status` slides up + fades in over 0.28 s via a
  `.show` class toggled by `flashStatus` / `clearStatus`)
- [x] Selection breathing ring (`drawSelectionRing` in `afterDrawing`: thin
  off-white `EDGE_HILITE_COLOR` ring just outside the selected node, alpha
  0.4 ↔ 0.7 + outset breathing over 1.6 s; self-managed `requestAnimationFrame`
  loop that runs ONLY while a node is selected; shares `traceNodeOutline` with
  the note glow so box / circle / cylinder all match)

## Backlog

### Quick wins

_Prototyped in a throwaway demo on 2026-06-09 and **declined** — left here so
they aren't re-proposed:_

- [ ] ~~**Edge endpoint nubs**~~ — tiny filled circle (~3 px) where each line
  meets a node, drawn in `afterDrawing` from `endpointPositions(e)` (circles
  clipped to radius, boxes via `rectExitT`). Read cleanly up close but not
  adopted.

- [ ] ~~**Faint level bands**~~ — alternating 2 % / 4 % white vertical bands
  behind each BFS column, derived live from `computeLevels()` + node x. Too
  faint to register against the dot grid + master aura on typical graphs;
  not adopted.

### Medium effort

- [ ] **Node hover lift** — on `hoverNode`, bump the node's shadow (or
  nudge it up 1 px). vis-network doesn't expose per-node shadow on hover
  cleanly, so easiest is a custom glow drawn in `afterDrawing` for the
  hovered id (tracked via the existing `hover-node` handler — store the
  id, not just the class).

- [ ] **Edge hover glow** — hovered edge gets a soft outer glow
  (`ctx.shadowBlur ≈ 12`). For bent edges, add it in `drawBentEdges` when
  the edge id matches the hovered id; for straight edges, would need a
  custom stroke pass (vis draws those itself). Makes edge-picking easier
  in dense graphs.

- [ ] **Glass-morphism toolbar** — `backdrop-filter: blur(12px)` +
  semi-transparent `--panel`. Canvas peeks through. One CSS change; check
  Safari/Firefox `backdrop-filter` support is acceptable for the audience.

- [ ] ~~**Custom font**~~ — **Declined** (prototyped 2026-06-09 with Inter
  embedded as base64 `@font-face`, applied to brand / buttons / canvas labels).
  The native system stack read better and Inter's wider metrics shifted label
  wrapping; not adopted.

- [ ] **Empty-canvas illustration** — faint ghost-graph silhouette behind
  the "Empty canvas" hint (a few rounded rects + lines + a circle) at
  ~8 % alpha. Either an inline SVG in `#empty-hint` or a `drawDotGrid`-style
  canvas pass gated on `nodes.length === 0`.

### Bigger swings

_All three **declined** (2026-06-09) — out of scope for this tool; left here
so they aren't re-proposed:_

- [ ] ~~**Dotted-edge flow animation**~~ — animate `ctx.lineDashOffset` so
  dotted edges drift toward the target. Needs a continuous `redraw` loop
  while any dotted edge exists; not worth the perpetual repaint. Declined.

- [ ] ~~**Mini-map**~~ — inset bottom-right showing the whole graph + a
  viewport rectangle, click-to-pan via `network.moveTo`. Most code of
  anything here; graphs are small enough not to need it. Declined.

- [ ] ~~**Path highlight / focus mode**~~ — click a node → fade everything
  not in its lineage to ~30 % alpha. The strongest *functional* idea, but
  out of scope for now. Declined.

### Optional / taste

- [ ] **HSL-aligned palette** — replace the 8 swatches with hues at equal
  HSL spacing (same S/L), so multiple coloured nodes sit together
  harmoniously. Pure data change in the `PALETTE` array; check the
  master's default red still fits.
