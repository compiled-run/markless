# U627 — building the `pad` family

The research memo (`U625-pad-research.md`) argued for it; the owner ruled on
2026-08-27 to build it cartesian-only. This is what actually got built, what the
build measured that the research could not, and what is left for the follow-up.

Green on this tip: `pnpm typecheck`, `pnpm exec vp test --project ui
packages/headless/components/src/pad` (49 rows, CSR and SSR), `pnpm test:sr` (33
files, 271 rows), `pnpm exec vp lint --deny-warnings` (0 warnings, 0 errors).
`pnpm typecheck:sr-real` is green too, which is what covers the NVDA and
VoiceOver files.

One caveat on that `test:sr` figure, recorded rather than smoothed over. Of four
full-suite runs, one came back `1 failed | 270 passed` and the failing row's name
was not captured before the next run went green again. It did not reproduce in
the three full runs either side of it, and `pad.sr.ts` on its own passed 6/6
three times in a row, so nothing points at this family — but it is one
unexplained red on a serial 33-file suite, and the next person to see a lone sr
failure should suspect flake before defect.

## Shipped

`packages/headless/components/src/pad/` — `pad.tsrx`, `pad-types.ts`,
`pad-math.ts`, `index.ts`, `note.md`, six scenarios (`basic`, `curve`, `bounds`,
`controlled`, `disabled`, `form`), `pad.browser.ts`, `pad.sr.ts`,
`pad-transcript.ts`, `pad.nvda.ts`, `pad.voiceover.ts`.

Nine parts, every name already in `SPEC.md`: `root`, `label`, `description`,
`error`, `area`, `thumb`, `valuelabel`, `field`, `indicator`. No new roles, no
new prefixes, nothing minted.

## The one framework wall, measured

`onDrag` on a `div` root collides with the DOM's own `ondrag`. Written as
`Omit<PropsOf<'div'>, 'onChange'>`, the prop's type comes out as the union and
the callback parameter is `EventWithCurrentTarget<DragEvent, HTMLDivElement> |
readonly PadPoint[]`:

```
packages/headless/components/src/pad/scenarios/controlled.tsrx(24,5):
error TS2322: Type 'EventWithCurrentTarget<DragEvent, HTMLDivElement> |
readonly PadPoint[]' is not assignable to type 'readonly PadPoint[]'.
```

Fixed by widening the omit to `'onChange' | 'onDrag'`, which is the established
idiom (colorpicker and ink already omit `onChange` for the same reason). The
root loses the native `ondrag` handler in exchange; a pad's area is not an HTML
drag source, so nothing real is given up. Recorded in `note.md` because the next
family that wants a gesture callback named after a DOM event will hit it.

Nothing else was pinned expected-red. No compiler refusal was hit at all — the
known ones were avoided by following the recorded idioms: computed names unique
to the module, cells read into locals before any call, the loop row's own value
held as a `state()` cell rather than closed over
(`MARKLESS_CAPTURE_OPAQUE_PROP`), and keydown guards written as `event.key ===
literal` chains only (`MARKLESS_SYNC_POLICY_UNEXTRACTABLE`).

## A real defect the browser lane caught

The first cut kept the "which axis, long or short announcement" cells on the
handle, and reset them in the handle's `onFocusin`. A drag that begins on a
handle that is **already focused** fires no `focusin`, so after a run of arrow
keys a pointer drag kept announcing the short form — `X 0.6` — when it had just
moved both axes and owed the person both numbers.

The fix moved those cells onto the shared state and keyed them by the handle a
run of keys is on (`movingId`, `axisAt`, `stepping`). A handle uses the short
form only while it is the handle a key run is on; anything else — focus arriving,
a change of axis, any pointer gesture — puts every handle back on the form that
names both numbers. This is also strictly more correct with several handles: the
one being stepped shortens, the others keep the full form, which the old
per-handle version could not express because a shared reset would have shortened
them all.

Pinned by `CSR/SSR: a controlled pad moves only once the page writes the points
back` and `CSR/SSR: each handle moves on its own`.

## The virtual reader splits on commas

`virtual-driver.ts` implements `segments` as `phrase.split(', ')`. A two-axis
`aria-valuetext` of `X 0.25, Y 0.75` therefore arrives as two facts, not one
phrase, and an sr row that asks for the whole string never matches — it walks its
30 steps and throws. Colorpicker's rows already assert one channel per fact for
this reason; it is not written down anywhere, so it is written down here. Four
rows failed on it before the split was matched.

## Decisions taken inside the packet's latitude

**One `role="slider"` per handle, not two axis elements.** The packet asked for
colorpicker's measured design and left the mechanism open ("two hidden axis
inputs or two-axis announcement, whichever colorpicker measured as best"), while
also specifying `pad.thumb` itself as the `role="slider"` and the tab stop.
Colorpicker measured two-axis announcement as best and refused hidden inputs
(datebox's wall: an input's displayed value is its property while the graph
writes attributes). Its two-element DOM cannot come along — its axis overlays are
`inset: 0` over the whole plane, which is exactly the thing the research memo
flagged as unusable with N handles. So: one element per handle, both axes always
in `aria-valuetext`, `aria-valuenow`/min/max following the axis a key run is on,
long-then-short kept.

**`Home`/`End` act on the axis the handle is on.** The packet says "to the axis
edges" and the research memo's table says x. On a single-element handle, "the
axis" is the one a key run left it on — the faithful port of colorpicker's
per-axis `Home`/`End`, except going to the ends rather than a page step, which is
the memo's own divergence and its reasoning. Both axes are reachable by a single
key this way, which x-only would not give.

**`--pad-x` / `--pad-y`, not `--x` / `--y`.** The packet wrote the shorthand; the
family-prefixed spelling is the shipped convention (`--colorpicker-x`,
`--slider-offset`) and a bare `--x` on a headless family is a collision waiting
in any consumer's stylesheet. The memo's own CSS-prefix test lands on `--pad-*`.

**`PageUp`/`PageDown` unbound.** The packet's key list does not name them. Shift
already gives the coarse step on both axes.

**The properties live on each handle, not the root.** N handles have N positions,
so there is no single `--pad-x` for a root to carry.

## What the scenarios have to teach a consumer

Two landmines, both already recorded elsewhere and both load-bearing here:

- a construct may not be the direct child of a component tag, so a keyed repeat
  over handles opens inside a plain element — `style="display: contents"` keeps
  that wrapper out of the layout so the absolutely-positioned handles still
  resolve against the area;
- a component that reads `pad.state()` must sit **inside** the root, or it starts
  a second pad of its own.

`scenarios/curve.tsrx` shows both, and computes the cubic-bezier `d` itself: the
family holds two points and knows nothing about easing.

## Left for the follow-up

Registration. `src/index.ts`, `package.json`, `test-support/**` and `api/**` were
out of contract by instruction, so:

- `pad` is not exported from the package index, and the scenarios import
  `../index.ts` (the family's own) the way `ink`'s do;
- the gallery has no pad section, so `PAD_ANCHOR` in `pad-transcript.ts` is the
  literal `'/#pad'` with a comment saying so. `FAMILY_ANCHORS` in
  `apps/sr-gallery/preview-server.ts` has no `pad` key yet, and reading a missing
  key is a type error. Point the anchor at `FAMILY_ANCHORS.pad` when the section
  lands — until then the NVDA and VoiceOver files typecheck but have nothing to
  visit.

Neither lane was executed locally, per the standing rule that real readers only
run in CI.

## Alignment target, not a refactor

`colorpicker.area` stays independent. It is green and its divergences are
colour-specific (page-step `Home`/`End`, RTL flipping x only, spoken colour
names, `forced-color-adjust: none`). `pad-math.ts` copies `slider-math.ts`'s
stepping and snapping rather than importing it. If a third 2D consumer appears
and all three want the same axis machinery, that is the moment to extract a
shared helper — the way `slider-math.ts` is shared today — not a shared family.
