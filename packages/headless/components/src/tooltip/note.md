# tooltip — implementation notes

Research: `goals/headless-components/notes/U443-tooltip-research.md`, which
supersedes the earlier `research-tooltip.md` on six points.

There is **no QDS tooltip** to port. `libs/components/src/` has no tooltip
folder, so this family's ARIA comes from the authoring practices plus Higley
rather than from a reference spelling. That is a stated consequence, not an
improvisation: there was nothing to diverge from.

## The warning that ships with the pattern

The W3C authoring practices carry this on the tooltip pattern itself, and it is
still there today, verbatim:

> NOTE: This design pattern is work in progress; it does not yet have task force
> consensus.

We ship the family anyway, because a tooltip is what people build and an
unhelped one is worse. The warning belongs in the docs beside it, unedited, so a
consumer knows the ground is softer here than under `checkbox`.

## Shape

Three parts: `tooltip.root`, `tooltip.trigger`, `tooltip.content`. All three are
established roles in `SPEC.md`; nothing new was named.

Four props on the root, and no more: `open`, `delay` (600), `side` (`top`),
`onChange`. What every other library ships and this one does not:

- **`arrow` / pointer part** — `SPEC.md` lists it under "explicitly not roles".
  An anchored arrow is consumer CSS over the anchor the family already emits.
- **`positioner`, `portal`, `viewport`** — none needed. The anchor is two
  attributes and the geometry is a stylesheet.
- **`provider`** — we have no context primitive, and the delay group it exists to
  hold is not in v1 (below).
- **`title`, `close`, `description`** — the tip *is* the description. There is
  nothing to name and nothing to close.
- **`namesTrigger`** — refused twice over. Its only expressible form is a ternary
  in an IDREF position, which is `MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE`; and
  it is not wanted anyway, because an icon-only trigger must carry its own
  accessible name regardless. The consumer writes `aria-label` on their button
  and the tip describes it. `icon-button.tsrx` is that case, with no library prop
  in sight.
- **`closeDelay`** — its job elsewhere is to bridge the gap between trigger and
  tip so a crossing pointer does not dismiss. The pointer handlers on the root
  get that from structure instead. Base UI and QDS both default it to zero.
- **`disabled`** — every other family's `disabled` guards an operation. A tooltip
  has none. A tooltip that should not show is one you do not render.
- **`interactive` / `disableHoverableContent`** — WCAG 1.4.13 hoverable is not
  optional, so it is not a prop. A deliberate divergence from Ark UI and Radix.
- **`trackCursorAxis`** — a tip that follows the cursor cannot be hovered onto,
  so it cannot satisfy hoverable. Chart tooltips are a different problem.
- **`closeOnClick`** — free from the overlay primitive; see below.
- **an auto-hide timeout** — never. WCAG 1.4.13 persistent.

`delay` and `side` are the names `navbar.root` and `popover.root` already ship,
per `SPEC.md`'s capability-naming rule — not `delayDuration`, not `openDelay`,
not `placement`.

## The permanent `aria-describedby`, and why it is legal

The trigger points at the tip at all times, showing or not. That is the row most
implementations fail, and it is what makes a tooltip reach a screen-reader user
who never hovers anything.

It works because the accessible-name-and-description computation carries an
explicit exception for direct references: the hidden-node exclusion applies only
to a node that is *not* the one an `aria-labelledby` / `aria-describedby`
relation points at. Directly referenced hidden text still contributes. So Tab
conveys the tip with nothing on screen, which `tooltip.sr.ts` asserts on a page
where the tip is verified `hidden` before and after.

`role="tooltip"` is set because that is what `getByRole('tooltip')` finds and
what the ecosystem queries. It is semantically inert — it changes no
announcement. `aria-describedby` does the whole job.

Not written, all on Higley's avoid list: `aria-haspopup`, `aria-expanded`,
`aria-controls`, `aria-labelledby`, the `title` attribute, any live region.

## Placement: the family's stylesheet owns identity, yours owns geometry

The anchoring is three ordinary CSS rules in `<style>` blocks inside the part
components. **The family writes no `style` attribute on any part** — `style` and
`class` on all three are entirely the consumer's, and compose untouched:

```css
/* tooltip.root */    div:not([ui-side]) { anchor-scope: --ui-tooltip; }
/* tooltip.trigger */ button             { anchor-name: --ui-tooltip; }
/* tooltip.content */ [ui-side]          { position: absolute; position-anchor: --ui-tooltip; }
```

One anchor name for every tooltip on the page, and `anchor-scope` on each root
confines it to that root's subtree. That is what keeps two co-rendered tooltips
apart: without it, `position-anchor` resolves to the *last* matching anchor in
tree order and both tips stack against the second trigger. The browser lane
measures exactly that — pull the `anchor-scope` rule and the isolation row fails
by 21px, which is how it was checked rather than assumed.

### The selectors are discriminated by structure, because the scope class is not

The compiled scope class is per **module**, not per component, so all three
blocks share one class and each block's rules can reach the other parts'
elements. The subjects are therefore chosen to be structurally unique inside this
module: the trigger is the only `button`, the tip is the only element carrying
`ui-side`, and the root is the `div` that is left (`div:not([ui-side])`). Rename
a part's element and the discriminator has to be re-picked in the same change.

**Consumer children are not reachable by these rules and never will be.** The
scope class is minted only onto elements this module renders, so a consumer's own
`<button>` inside `tooltip.content` carries no class and cannot be caught by
`button { anchor-name: … }`. That is a property of the scoping, not a promise
this family makes.

Popover hand-writes the same shape for `--ui-popover`; the two families now agree
on the mechanism.

There is no computed placement here, and that stays true for a stronger reason
than before: nothing in the family reaches the `style` attribute at all, so the
old `MARKLESS_ELEMENT_HANDLE_ANCHOR_STYLE_DYNAMIC` refusal ("a CSS anchor cannot
share an element with a computed style") no longer has anything to bite on. The
geometry belongs to the consumer either way:

```css
.tip {
	position-try-fallbacks: flip-block, flip-inline;
	position-visibility: anchors-visible;
}
.tip[ui-side='top'] { position-area: top span-all; margin-bottom: 4px; }
.tip[ui-side='bottom'] { position-area: bottom span-all; margin-top: 4px; }
```

`position-area`, `@position-try`, `position-visibility`, offsets and any polyfill
are all the consumer's, which is where the support floor is actually known.
Nothing here measures a box, nothing runs on scroll, and a tip served already
showing is placed on its first layout with no interaction — `served-open.tsrx`
plus the SSR geometry row.

## Measured, against the research: DOM order does not decide the anchor here

The memo's §4e reads the anchor spec's "laid out strictly before" wording as a
hard rule that `tooltip.content` must follow `tooltip.trigger` or the placement
silently fails. **That is not what happens.** `reversed.tsrx` authors the tip
first and it still lands against the trigger: measured `tip.top` 162 against
`anchor.bottom` 162, with `position-area: bottom span-all` resolved.

The condition that actually governs is a disjunction — the anchor is acceptable
if it is *not absolutely positioned*, **or** it comes first in flat tree order.
This family's trigger is an ordinary in-flow `<button>`, so the first half holds
from anywhere in the markup.

The advice stays in the prop docs, narrowed to what is true: write the tip last,
because the day a consumer absolutely positions their own trigger the order does
start to decide it, and CSS has no channel to report the miss.

## What the overlay primitive gives, and what tooltip declines

The tip carries the bare `overlay` mark. Enlistment follows the `hidden`
*binding*, which is why the tip is hidden rather than held in an `@if` arm — that,
and the trigger pointing at its minted id.

Free, with no code in this family:

- **Escape from anywhere.** The primitive's document-level capture listener
  reports it as `dismiss` on the topmost enlisted element. The authoring
  practices' "Escape dismisses the tooltip" and WCAG "dismissable", without the
  family installing a listener and without the trigger needing focus.
- **A press anywhere outside closes it, including a press on the tooltip's own
  trigger** — the trigger sits outside the tip, so its press is an outside press.
  That is Base UI's `closeOnClick` for zero props.

Declined:

- **Focus trap and modality.** The family never writes `aria-modal`, so the
  primitive's modality check never matches. Nothing is disabled; it is derived.
- **Focus return on dismiss.** Popover and navbar hand focus back on Escape. A
  tip never holds focus, so that branch would be dead code. `onDismiss` here is
  two lines.
- **The click-grace window.** Popover needs one because its trigger toggles. This
  trigger never toggles, so a press that closes the tip should simply leave it
  closed — which is what the browser row asserts.

### The debt this family takes on, named rather than folkloric

The primitive keeps **one** stack and reports a dismissal to its topmost entry
only. A tip that enlists while a popover is open is topmost, so a press outside
both closes the tip and leaves the popover open; the same for the first Escape.
The tip was going to close on pointer-leave anyway, so it has swallowed a
dismissal that belonged to the surface underneath.

The platform's own answer is a separate stack: `popover="hint"` closes other
hints without closing open `auto` popovers. Ours has one tier. That is a
framework change to `packages/web/src/fns/overlay.ts`, so v1 ships as it is and
`tooltip.browser.ts` asserts the **current** behaviour in a row that says so. The
day a hint tier lands, that row flips instead of surprising someone.

## Timers: a scheduled callback cannot reach the graph

Navbar found this and this family inherits it whole. Written the obvious way:

```js
tooltip.openTimer = window.setTimeout(() => {
	tooltip.setOpen(true); // ReferenceError: tooltip is not defined
}, tooltip.delay);
```

Shared reads are rewritten at the handler symbol's top level and not inside a
nested closure. The shape that works keeps the graph out of the callback: the
handler writes a deadline (`restingUntil`) onto the instance and the timer does
DOM work only — it asks the browser to deliver the same `pointerover` again once
the wait is up, and the handler runs a second time, now past its deadline. The
`+ 5` is slack so the re-delivered crossing lands after the deadline rather than
on it.

It also makes teardown mild: a tooltip that goes away mid-wait leaves a dispatch
at a detached node, whose handler finds nothing to do. There is a red-first row
for exactly that.

## Hoverable comes from the structure, not from a polygon

The pointer handlers sit on `tooltip.root`, which wraps both the trigger and the
tip. Moving trigger → tip is an intra-root move, `root.contains(relatedTarget)`
is true, and nothing closes. That is WCAG 1.4.13 hoverable satisfied
structurally — no convex hull, no throttled document `pointermove`, no listener
to leak. It retires the research's largest identified risk: QDS's 141-line
`safe-polygon.ts` is not ported and is not needed.

`pointerover`/`pointerout` rather than `pointerenter`/`pointerleave`, because only
the first pair carries `relatedTarget`. `pointerType === 'touch'` returns early at
the top of the enter handler, matching QDS and the industry position that touch
is not a tooltip's input.

**The residual, which is real.** A consumer who separates the tip from the trigger
with a `margin` leaves dead space that is inside neither element: the pointer
crosses it, `pointerout` fires with a `relatedTarget` outside the root, and the
tip closes. Offset with the tip's own margin only in the direction *away* from
the trigger, and keep the visual gap inside the tip's padding. Navbar has the
same property today.

Focus opens with **no** delay at all. A person who arrived by keyboard has
already declared the intent a resting pointer only implies.

## No cross-tooltip skip window in v1

Every library has one: once a tooltip has opened, its neighbours open with little
or no delay for a while afterwards (Radix `skipDelayDuration`, Base UI
`Provider.timeout`, Ariakit `skipTimeout`, React Aria's warmup/cooldown, QDS's
`hoverGroup.switchDelay`). Navbar gets the same effect for free by scoping it to
one root, but one tooltip root holds one tooltip, so the same trick needs a scope
we do not have.

Each tooltip therefore waits its own `delay`. The alternative — a plain `state()`
object shared across widget instances — rests on an unanswered framework question,
and answering it to buy a nicety is the wrong order. QDS's `getEffectiveDelay` is
14 lines if we ever want it.

## Test lanes

`tooltip.browser.ts` — 28 rows, CSR and SSR. The shared rows in both modes
(describedby while hidden, role + `overlay` + `hidden`, the anchor wiring, the
dropped props, two instances each landing against their own trigger), then the
delay being real, focus opening with no wait, both halves of hoverable, the tip
never closing on its own, Escape with focus on the trigger, a press on the
trigger, a touch crossing that opens nothing, the pending-timer teardown, the two
geometry rows, the toolbar isolation row, the two inside-a-popover rows, and the
SSR served shape and served-showing placement.

The geometry rows carry the consumer half of the contract themselves — a
stylesheet appended in `beforeEach` — because the family emits no
`position-area` of its own. They are the only way to catch a `position-anchor`
that silently did not resolve.

**Every geometry row asserts a placement static flow cannot produce.** An earlier
pair of them was false green: `served-open.tsrx` was `side="bottom"` with the tip
authored last, so an absolutely positioned box with no resolved anchor lands at
its static position — directly below the trigger — which is precisely where a
working `position-area: bottom span-all` puts it. The two rows passed with the
anchoring entirely dead. The scenario is now `side="top"`, so "above the trigger"
is a placement only a resolved anchor reaches, and the rows were confirmed red by
renaming the trigger's anchor to something nothing points at: 39px off, not
green. `reversed.tsrx` keeps `side="bottom"` and stays honest by the opposite
trick — it authors the tip *first*, so static flow would put it above.

`tooltip.sr.ts` — 5 rows on the virtual reader: reaching the trigger conveys role,
name and the tip with the tip verified hidden; the icon-only trigger conveying
its own name and the tip as two distinct facts; showing the tip announcing
nothing new; Escape announcing nothing; the hidden tip not being a stop on the
walk. Its `afterEach` unwind is copied from `popover.sr.ts` — the overlay stack
is page-wide, and a tooltip suite leaves surfaces enlisted constantly.

`tooltip-transcript.ts` + `tooltip.nvda.ts` + `tooltip.voiceover.ts` — the narrow
honest scope for a real reader. NVDA and VoiceOver do not hover, and simulating
it would test our own synthetic events rather than the reader. What they do do is
read a description on focus, inconsistently across products, which is exactly
worth pinning: one walk to the trigger, one assertion that the role, the name and
the tip are all conveyed. Nothing about the visual overlay.

**Not tested, and why:** exact announcement wording (there is no `w3c/aria-at`
test plan for this pattern, so there is nothing to pin utterances against); real
touch input; anchor positioning outside Chromium in CI.

## Conformance

The family has no `openCycle` in the shared battery. A tooltip's trigger is
*described by* the tip, it does not activate it — and clicking the trigger of a
showing tip closes it rather than toggling, so the battery's click-to-open cycle
would be asserting a gesture this family deliberately refuses. Hover, focus and
both dismissal paths are covered in `tooltip.browser.ts` instead.

## Still open

- **`TooltipTriggerProps` and `TooltipContentProps` still say the family owns the
  `style` attribute.** It does not any more — the anchoring moved into the parts'
  own `<style>` blocks and `style`/`class` on all three parts are the consumer's.
  Fixing the prose alone is not enough: `api/manifest.json` is a shipped export
  subpath that snapshots those same doc comments, so it goes stale the moment
  they change. The two have to move in one change set — edit `tooltip-types.ts`,
  then `pnpm --dir packages/headless/components api:extract`. The manifest is
  outside this unit's contract, which is the only reason the prose was left
  standing.
- **The gallery section is not wired into the real-reader lanes.**
  `apps/sr-gallery/preview-server.ts` needs `tooltip: '/#tooltip'` in
  `FAMILY_ANCHORS`, and `apps/sr-gallery/scripts/boot-check.ts` needs
  `tooltip: 'tooltip'` in its `RENDERED_ROLE` table, which is total over
  `FamilyName`. Both are one line and both are outside this unit's contract.
- **The tooltip section shifts slider's walk.** The gallery section sits between
  popover and slider, so `src/slider/slider-transcript.ts`'s `WALK_LIMIT` — 220,
  commented "the eleventh of twelve" — should become 250 and "the twelfth of
  thirteen". Popover's own limit is unaffected (tooltip lands after it); only its
  "tenth of eleven" comment is now off by the count. Both files are outside this
  unit's contract.
- **No `./tooltip` export subpath.** `src/index.ts` carries the family, so
  `import { tooltip } from '@markless/ui'` works; the per-family subpath in
  `package.json` `exports` is a separate edit.
- **A hint tier in the overlay primitive.** The single-stack debt above.
- **A cross-tooltip skip window.** Needs the shared-value question answered
  first.
- **A scheduled callback that can reach the graph.** Inherited from navbar; would
  collapse the re-dispatch idiom to three lines.
