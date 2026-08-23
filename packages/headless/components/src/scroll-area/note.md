# scroll-area — implementation notes

The family follows `goals/headless-components/notes/research-scroll-area.md`.
What is recorded here is only what the source cannot show: where the tier
boundary falls, where the design departed from the QDS reference, and the
framework limits this family ran into — each measured on this branch rather than
assumed.

## Shape

The QDS folder's exact part list, four parts: `root`, `viewport`, `scrollbar`,
`thumb`. Each renders one element and nothing else. There is no `content` part
and no `corner` part, matching QDS (Radix, Base UI and Ark UI have both).

**There is no `shared()` in this family, no `state()`, and no event handler.**
That is not an omission — at these tiers a scroll area is a `div` with
`overflow: auto` plus the two attributes that make it reachable and nameable,
and everything the QDS reference spends JavaScript on is either CSS or
unnecessary. Nothing is seeded, nothing resumes, and the served HTML is already
complete: `SSR: nothing moves after resume` compares the root's `outerHTML`
before and after a turn of the event loop and it is byte-identical.

## Tiers: what ships here and what does not

The research note names three tiers. **This unit is tiers 1 and 2.**

- **Tier 1 — root + viewport.** A named, keyboard-reachable scroll container
  with the native scrollbar left alone. `basic.tsrx` is that, and it is most
  consumers' answer.
- **Tier 2 — scrollbar + thumb, positioned by CSS.** The native scrollbar is
  hidden with `scrollbar-width: none`, a painted one is drawn, and the thumb's
  offset comes from a CSS scroll-driven animation. Still no JavaScript.
- **Tier 3 — dragging the thumb. NOT IMPLEMENTED, and deliberately not stubbed.**

**The thumb in this family is decorative: it tracks the scroll position and
cannot be dragged.** Every other way of scrolling works — wheel, trackpad,
touch, keyboard, find-in-page, `scrollIntoView`, `scroll-snap`, and a
virtualiser placed inside the viewport — because nothing here intercepts any of
them. Anyone who tries to drag the painted thumb will find it inert, and that
will read as unfinished against QDS and Radix. It is blocked on two owner
questions recorded in the research note §8:

1. whether an `element()` handle can be read for a live DOM property
   (`scrollTop`, `scrollHeight`) inside an event handler — used but unproven in
   that direction on this branch;
2. whether element observation (a `ResizeObserver` surface) should exist at all,
   which a proportional thumb size needs. The research note deliberately does
   not propose one.

No drag scaffolding, no `dragging` cell and no pointer props were added, so
nothing here has to be unpicked when tier 3 is cut.

## Deliberate departures, each with its reason

The standing order is that the QDS API is the API. Three things differ, and the
constraint that forced each one is named.

- **No `type` and no `hideDelay` on the root.** QDS's `type`
  (`'hover' | 'scroll' | 'auto' | 'always'`) and `hideDelay` exist only to drive
  a JavaScript-computed `ui-state="visible" | "hidden"` on the scrollbar, off
  `onMouseEnter$`/`onMouseLeave$` and a `setTimeout`. At these tiers there is no
  JavaScript to compute it with. `hover` and `always` are plain CSS the consumer
  already writes (`:hover` on the root, or nothing at all); `scroll` is the one
  value that genuinely needs a listener, and shipping a prop whose most
  interesting value silently does nothing would be worse than not shipping it.
  `auto` was already a synonym for `always` in QDS's own `shouldShow()`. The
  props return with tier 3, where there is a listener to honour them.
- **`ui-vertical` / `ui-horizontal` presence attributes instead of QDS's
  `ui-orientation="vertical"`.** The repo convention (owner ruling 2026-08-18)
  is presence attributes for state reflection, and every shipped family here
  follows it. `orientation` stays a QDS-shaped prop on the part; only the
  attribute spelling changes.
- **No `aria-label` default.** QDS hard-codes `role="region"` plus
  `aria-label="Scrollable content"` on every viewport, which is untranslatable
  and, on a page with three areas, produces three identically named landmarks —
  the exact failure a name exists to prevent. The role and the `tabindex` are
  kept, because a focusable container must be nameable; the name is the
  consumer's. `spread-first.tsrx` renders an unnamed viewport so the suite can
  assert the absence rather than let a default creep back.

Four QDS defects the research pinned are absent by construction rather than by
being fixed:

- the shared `thumbRef` across both orientations — there is no ref;
  `both-axes.tsrx` renders two thumbs and the suite asserts each scrollbar
  contains only its own;
- `document.querySelector("[ui-qds-scroll-area-viewport]")` picking the first
  area on the page — there is no DOM sensing; `two-areas.tsrx` is the
  counter-proof;
- the per-scroll-event `querySelector` for the thumb — the thumb is positioned
  by CSS, and the suite asserts that scrolling rewrites nothing in the markup;
- the unconditional `document` `mousemove`/`mouseup` listeners, two per thumb —
  the suite wraps `document.addEventListener` around a render of `two-areas` and
  asserts none of `mousemove`, `mouseup`, `pointermove`, `pointerup`, `wheel`,
  `resize` were registered. It deliberately does **not** assert "zero listeners":
  the framework's own delegation is not this family's to promise.

`role="scrollbar"` is not used on either painted part, and both carry
`aria-hidden="true"`. There is no APG pattern for this family, and
`role="scrollbar"` describes a widget that is the *only* way to scroll something
and carries keyboard obligations of its own; ours is paint over a control that
is already fully operable.

## The family ships no CSS, and here is the recipe it would have shipped

QDS ships `scroll-area.css` selecting on `[ui-qds-scroll-area-*]` identity
attributes. Those attributes are dropped by owner ruling, which leaves a shipped
stylesheet nothing stable to select — and a headless family has no business
deciding what a scrollbar looks like anyway. So the CSS is the consumer's, and
the scenarios write it: everything inline except `@keyframes`, which has no
inline form and lives in `scenarios/scenario.css`.

The mechanism, in full, is four declarations:

```
root      { position: relative; timeline-scope: --sa-y; }
viewport  { overflow: auto; scrollbar-width: none; scroll-timeline: --sa-y block; }
thumb     { position: absolute; top: 0; height: 24px;
            animation: sa-thumb-y linear both;
            animation-timeline: --sa-y; }          /* AFTER the shorthand */
@keyframes sa-thumb-y { to { top: calc(100% - 24px); } }
```

Three things about it are load-bearing:

- **`animation-timeline` must come after the `animation` shorthand**, which
  resets it to `auto`. Written the other way round the thumb never moves.
- **The thumb is not inside the viewport**, so `scroll(nearest)` cannot find the
  scroller. The name plus `timeline-scope` on the root is what bridges them, and
  it is also what makes the wiring per-instance: `two-areas.tsrx` puts the *same*
  name in scope on both roots and each thumb still resolves its own area's
  viewport. That row runs and passes.
- **A fixed thumb height is the v1 answer.** A proportional one is
  `clientHeight / scrollHeight`, which no CSS property exposes, so it needs
  measurement and re-measurement — the observation question above.

Both axes at once is `scroll-timeline: --sa-y block, --sa-x inline` on the
viewport and `timeline-scope: --sa-y, --sa-x` on the root.

The thumb rows are gated on
`CSS.supports('animation-timeline', 'scroll()') && CSS.supports('timeline-scope', '--name')`
so the suite does not go red on a runner without scroll timelines. On this
branch's Chromium the gate is open and the rows run for real.

## Framework limits this family ran into

1. **A destructuring default cannot be read from a template position.**
   `({ orientation = 'vertical', ... })` with `ui-vertical={orientation === 'vertical'}`
   is refused at compile time with
   `MARKLESS_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED`: a template position reads
   the raw prop cell, not the materialized local, so it would render `undefined`
   where a default was authored. The refusal is correct and it is fail-closed.
   The family writes the fallback at the read site instead —
   `ui-vertical={orientation !== 'horizontal'}` — which is one of the two fixes
   the diagnostic itself suggests, and needs no state cell for a value that never
   changes.

2. **An `element()` handle passed to a part as an attribute never reaches the
   element.** `<h2 el={headingEl}>` above
   `<scrollarea.viewport aria-labelledby={headingEl}>` produces a heading with no
   minted `id` and a viewport with no `aria-labelledby` at all — silently, in
   both CSR and SSR. This is the graph half of the gap `checklist/note.md`
   limit 1 already records: a spread onto a component tag now forwards the value,
   but no view record binds a handle passed that way, so no IDREF is ever minted.

   It matters here more than the usual cross-part case, because a scroll area's
   name is *always* the consumer's — there is no family-owned label part to route
   it through. `named-by-heading.tsrx` writes `id="terms-heading"` by hand, which
   works in both modes and is what a consumer would write today;
   `named-by-handle.tsrx` keeps the handle shape with two `test.fails` rows so
   the day the binding lands, the rows flip instead of the shortfall being
   rediscovered.

3. **`tabindex` is typed `number`.** `tabindex="0"` fails `tsc` with
   `Type 'string' is not assignable to type 'number'`; `tabindex={0}` is correct
   and renders the same attribute. Noted because the research note and every
   surveyed library spell it as a string in their prose.

## What is not tested, and why

Real trackpad momentum, real touch scrolling, OS scrollbar appearance settings,
and browser zoom (the case QDS spends a synthetic `qdsoverflowcheck` event and a
50 ms timer on) cannot be driven from vitest browser mode. Neither can a drag,
which does not exist here yet.

The suite also does not assert that a native scrollbar *appears* in
`basic.tsrx`: headless Chromium's scrollbar is an overlay with no width, so the
assertion would be measuring the runner rather than the family. The opposite
direction is asserted — with `scrollbar-width: none` the viewport's
`offsetWidth - clientWidth` is `0` while its content overflows, which is the
"required CSS" fact every library in the field ships.

## Outside this unit's file contract

The family is not reachable from the package yet: `src/index.ts` has no
`export * as scrollarea` line and `package.json` has no `./scroll-area` entry.
Both are the fan-in's to wire. The suite and the scenarios import through
relative intra-package paths, so nothing here depends on either.
