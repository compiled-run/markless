# hovercard — implementation notes

Research: `goals/headless-components/notes/U481-hovercard-research.md`.

A hover card and a tooltip share a gesture and nothing else. A tip **describes**
its trigger; a card **previews the trigger's destination**, and it holds links,
buttons and images a person has to be able to reach. Everything below follows
from that one difference.

## Shape

Three parts: `hovercard.root`, `hovercard.trigger`, `hovercard.content`. All
three are established roles in `SPEC.md`; nothing new was named.

Five props on the root, and no more: `open`, `delay` (700), `closeDelay` (300),
`side` (`bottom`), `onChange`.

`hovercard.trigger` renders an `<a>` and only an `<a>`. That is the family's
central doctrine made structural rather than advisory: **the card must never hold
information that is not also behind the link.** A person on a touch screen, or
reading with a virtual cursor, never sees the card — they follow the link and get
everything. A button trigger would have no destination and would take that
guarantee away, so it is refused in v1; a consumer who wants one reaches for
`popover`.

## The accessibility stance, and the deliberate divergence

Radix documents its hover card as "intended for sighted users only", and Base UI
says the same. Both then remove the content from the tab sequence on purpose.
**We do not follow them**, and the reason is structural rather than a difference
of appetite: both libraries portal the card to `document.body`, which destroys
the natural tab relationship and leaves re-establishing it as focus work nobody
wanted to write. We do not portal. Our card is the trigger's next DOM sibling, so
its focusables are already next in the tab order — the property they gave up is
one we get by writing no code at all.

So the family ships the model the platform's own interest-invokers work
prescribes for rich hints:

- `aria-expanded` and `aria-controls` on the trigger. `aria-expanded="true"` is a
  promise that something was revealed; here it is one that can be kept.
- The card is next in tab order after the trigger. Tab moves into it; the card
  stays showing, because closing is scoped to the **root**, not the trigger.
- Escape closes and returns focus to the trigger.
- No focus trap. GitHub's hovercards trap, and GitHub has the filed reading-order
  complaints. Tabbing past the end of the card lands on whatever follows.

**`aria-details` was considered and refused twice over.** It is not one of the
positions an `element()` handle can be written to, and its reader support is poor
enough that it would buy little if it were. `aria-expanded` + `aria-controls` is
the disclosure spelling, is uniformly supported, and is already shipped in this
library on a hover-opened trigger — `navbar.itemtrigger` does exactly this over a
panel of links.

**No `aria-describedby`, and this is the sharpest break from tooltip.** A
description is flattened to a single string in the accessibility tree. Flattening
a card holding a heading, three links and a Follow button produces one run-on
utterance with every link welded together and none of them operable. The shipped
tooltip's best property is exactly the one this family must not copy, so
`hovercard.browser.ts` asserts the absence: a future copy-paste from
`tooltip.tsrx` fails that row.

**No role on the content.** Not `tooltip` — that role is for a popup *describing*
an element, and this is a tab stop holding buttons. Not `dialog` — that implies a
name requirement and a modality this family refuses. The disclosure pattern puts
no role on the revealed region, and neither Radix's `Content` nor Base UI's
`Popup` sets one.

**What we still do not get, stated rather than papered over:** a reader browsing
with a virtual cursor who never focuses the link gets nothing. That is
irreducible for a hover-triggered surface, and it is exactly why the redundancy
rule above is the family's doctrine and lives in the prop docs.

## Delays

**700ms to open.** Radix 700, Base UI 600, Kobalte 700. Higher than tooltip's 600
because the cost of a false open is higher: a card is a large surface that
occludes what is under it, and in the archetype it fires a network request.

**Focus waits the same 700ms** — a deliberate inversion of tooltip, which opens on
focus at once. Tooltip's reasoning is that a person who reached a control by
keyboard has declared intent; that fails for a card, because someone tabbing
through a paragraph of links has declared interest in none of them, and a card
firing at every stop is the annoyance a delay exists to prevent.

**300ms to close**, and unlike tooltip this one earns its place. Radix, Base UI
and Kobalte all say 300. Tooltip dropped `closeDelay` because the pointer
handlers on the root give hoverability structurally, with the residual named:

> A consumer who separates the tip from the trigger with a `margin` leaves dead
> space that is inside neither element.

For a tip that residual is small. For a card it is not: cards sit at a visible
offset by convention and the pointer travel is long. `gapped.tsrx` is that case,
and the row that crosses it is the evidence tooltip's note asked for.

## Timers: a scheduled callback cannot reach the graph

Navbar found this and tooltip inherited it; this family inherits it twice, once
per direction. Written the obvious way, `hovercard.setOpen(true)` inside a
`setTimeout` is a `ReferenceError`: shared reads are rewritten at the handler
symbol's top level and not inside a nested closure.

Both timers therefore do DOM work only. The handler writes a deadline onto the
instance (`restingUntil` to open, `closingUntil` to close) and asks the browser to
deliver the same crossing again once the wait is up; the handler runs a second
time, now past its deadline, and acts. The `+ 5` is slack so the re-delivered
crossing lands after the deadline rather than on it. A pointer that comes back
during the grace clears `closingUntil` before anything else, which is why that
clear sits above the "already showing" guard rather than below it.

It also makes teardown mild: a card that goes away mid-wait leaves a dispatch at a
detached node whose handler finds nothing to do. There is a row for exactly that.

## Measured: a callback the root stores is invisible to the root's own handlers

`onChange` is reported two different ways, and it is not a matter of taste.

A handler is compiled into a module of its own, and a call to a `shared()` method
is compiled by **copying that method's body in**. `setOpen`'s body reads the
`onChange` slot on the instance — and from inside a handler belonging to the same
component whose render put it there, that slot is empty. Measured: hover and focus
changes driven through `hovercard.setOpen()` reported nothing at all, ever, while
the card's own dismissal — written in `HovercardContent`, a different component —
reported normally through the very same slot.

So the root's four handlers set `hovercard.open` and call the `onChange` **prop
they close over**, the way every family calls a consumer's `onPointerover`
passthrough. `setOpen` stays, used by the content's `onDismiss`. Two rows pin the
two routes, so the day the framework closes this gap the split can be collapsed
without guessing which half was load-bearing.

## Placement: the family's stylesheet owns identity, yours owns geometry

Identical to tooltip's shipped spelling. Three ordinary CSS rules in `<style>`
blocks inside the parts, and **the family writes no `style` attribute on any
part** — `style` and `class` on all three are the consumer's and compose
untouched:

```css
/* hovercard.root */    div:not([ui-side]) { anchor-scope: --ui-hovercard; }
/* hovercard.trigger */ a                  { anchor-name: --ui-hovercard; }
/* hovercard.content */ [ui-side]          { position: absolute; position-anchor: --ui-hovercard; }
```

One anchor name for every card on the page, with `anchor-scope` on each root
confining it to that root's subtree. Without it `position-anchor` resolves to the
*last* matching anchor in tree order and both cards stack against the second
trigger, which the geometry row catches.

The compiled scope class is per **module**, not per component, so each block's
subject is chosen to be structurally unique inside this module: the trigger is
the only `a`, the card is the only element carrying `ui-side`, and the root is the
`div` left over. Rename a part's element and the discriminator has to be re-picked
in the same change.

**The hazard this family is the first to face, and it is clean.** A card
*contains* consumer links, so `a { anchor-name: --ui-hovercard; }` looks like it
could catch them and mint duplicate anchors — where "last anchor in source order
wins" would silently drag every card onto the wrong element. It cannot happen: the
scope class is minted only onto elements this module renders, so a consumer's
`<a>` inside `hovercard.content` carries no class and no rule here can reach it.
Tooltip states this as a property of the scoping; here it is load-bearing, so
`two-cards.tsrx` measures it — the consumer link's computed `anchor-name` is
`none`.

Everything about where the card lands is the consumer's, keyed off `ui-side`:

```css
.card {
	position-try-fallbacks: flip-block, flip-inline;
	position-visibility: anchors-visible;
}
.card[ui-side='bottom'] { position-area: bottom span-all; margin-top: 8px; }
```

A large card overflows more readily than a tip, which makes
`position-try-fallbacks` more valuable here — but it is still the consumer's line.

## What the overlay primitive gives, and what hovercard declines

The card carries the bare `overlay` mark. Enlistment follows the `hidden`
*binding*, which is why the card is hidden rather than held in an `@if` arm —
that, `hidden` being what removes its links from the tab order, and the trigger
pointing at its minted id.

Free, with no code in this family: Escape from anywhere, and a press outside
closes it.

Declined: `aria-modal` is never written, so the primitive's modality check never
matches. Nothing outside is marked inert and the page's scroll is never locked —
a card must not lock the page, and a row asserts both.

`onDismiss` is popover's, not tooltip's: focus containment is read **before** the
close, because a hidden subtree cannot hold focus and afterwards the answer is
gone. Only `reason === 'escape'` hands focus back; an outside press is a person
choosing where to be.

### The debt this family takes on, named rather than folkloric

The primitive keeps **one** stack and reports a dismissal to its topmost entry
only. A card that enlists while a popover is open is topmost, so a press outside
both closes the card and leaves the popover open. The platform's own answer is a
separate stack for hint-tier surfaces; ours has one tier. That is a change to the
overlay code in the web package, so v1 ships as it stands and the browser lane
carries the row as a **known gap** — written as what should happen, so it goes
green the day the tier lands instead of surprising someone.

## What v1 refuses

No nesting (a same-family `shared({ scope: 'widget' })` nest is unproven anywhere
in this library, and two surfaces holding focus on one overlay stack is
unresolvable); no touch reveal; no arrow, portal, positioner or viewport part; no
focus trap; no modality or scroll lock; no auto-hide (WCAG 1.4.13 persistent); no
cursor tracking; no delay group across cards; no ARIA configuration from props;
and no information in the card that is not also behind the link.

## Test lanes

`hovercard.browser.ts` — 32 rows, CSR and SSR, with one known gap. The shared rows
in both modes (the disclosure wiring while closed, the absence of any description
relation or role, the anchor wiring, the dropped props, two cards each landing
against their own trigger with the consumer link minting nothing), then both
delays being real in both directions, Tab into the card and out the far side,
both halves of hoverable, the gap crossing, the card never closing on its own,
Escape returning focus, an outside press not returning it, no scroll lock and no
inert, a touch crossing opening nothing, the pending-timer teardown, both
`onChange` routes, the geometry row, the two inside-a-popover rows, and the SSR
served shape, served-showing placement, first crossing after resume and Tab into
the card after resume.

The geometry rows carry the consumer half of the contract themselves — a
stylesheet appended in `beforeEach` — because the family emits no `position-area`
of its own, and **every one asserts a placement static flow cannot produce**.
`served-open.tsrx` and `two-cards.tsrx` are `side="top"` with the card authored
last for exactly that reason: an absolutely positioned box with no resolved anchor
lands at its static position, which for `side="bottom"` is where a *working*
anchor would put it. That is tooltip's false-green lesson, applied up front.

`hovercard.sr.ts` — 5 rows on the virtual reader: the trigger conveying link, its
own name and **collapsed**; opening flipping it to **expanded**; the open card
being walked as three distinct facts rather than one flattened string; opening
announcing nothing on its own; the hidden card not being a stop on the walk.
Its `afterEach` unwind is copied from `popover.sr.ts` — the overlay stack is
page-wide.

`hovercard.nvda.ts` / `hovercard.voiceover.ts` — one row each over the served
gallery, both reading `hovercard-transcript.ts`: the link trigger announced
collapsed, the same trigger announced expanded once the focus delay has elapsed
under it, Tab landing inside the card with the trigger still expanded, and Escape
closing it and returning focus. Focus is put on the trigger directly rather than
tabbed onto from wherever the reader left it — a reading cursor is not the
browser's focus, and this family opens on focus.

**Not tested, and why:** exact announcement wording (there is no `w3c/aria-at`
test plan for this pattern, so there is nothing to pin utterances against); real
touch input; anchor positioning outside Chromium in CI.

## Conformance

The family has no `openCycle` in the shared battery. Its trigger is a link:
pressing it goes where it points rather than opening anything, and both ways in
are timed. The battery's click-to-open cycle would be asserting a gesture this
family deliberately refuses, so the disclosure wiring, the delays, Tab into the
card and both dismissal paths live in `hovercard.browser.ts` instead.

## Still open

- **No reader has spoken these lanes yet.** `hovercard.nvda.ts` and
  `hovercard.voiceover.ts` now exist, compile and are collected by the real-reader
  config — the gallery carries a `/#hovercard` section, and `FAMILY_ANCHORS` and
  `boot-check.ts`'s total `RENDERED_ROLE` table both name it. Neither reader
  starts on a macOS dev machine: NVDA answers "NVDA is not supported" (it is
  Windows-only) and VoiceOver answers "Failed to mount Guidepup preferences",
  which wants `npx @guidepup/setup setup` and `npx @guidepup/setup install` plus
  the automation grant. The four steps the transcript pins are the family's
  central claim rather than a corner of it: hear the link collapsed, hear it
  expanded after the delay, Tab into the card, Escape back to the trigger. Every
  DOM half of those four has been measured against the served gallery in
  Chromium; what is still a guess is the reader half — that neither reader's
  cursor commands disturb the browser focus the transcript puts on the trigger,
  and that both pass Tab and Escape through to the page.
- **Adding a gallery section shifts the walks after it.** Every transcript's
  hard-coded `WALK_LIMIT` counts steps from the top of the gallery page, so a new
  section moves the ones below it. The hovercard section was appended last for
  exactly that reason, so it shifted none of them; its own limit is the largest on
  the page. Tooltip's note already records that
  `src/slider/slider-transcript.ts` is owed the same correction.
- **No `./hovercard` export subpath.** `src/index.ts` carries the family, so
  `import { hovercard } from '@markless/ui'` works; the per-family subpath in
  `package.json` `exports` is a separate edit.
- **A hint tier in the overlay primitive.** The single-stack debt above.
- **A callback stored by a component, readable from that component's own
  handlers.** Would collapse the two `onChange` routes into one.
- **A scheduled callback that can reach the graph.** Would collapse both
  re-dispatch idioms.
