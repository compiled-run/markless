# tour — implementation notes

A product tour: a sequence of steps, each spotlighting an element the **consumer**
owns, dimming the rest of the page, and showing a positioned card with a title, a
description and back/forward controls. Built from
`goals/headless-components/notes/U568-tour-research.md` and the measured gates in
`packages/vitest-browser/browser/tour-gates/`.

**This family does not ship yet.** The build stopped on a missing owner decision,
recorded under "The blocking gap" below. Everything else here is built and
typechecks; the browser lane is written and red behind that one gap.

## Shape

| Part | Element | Carries |
| --- | --- | --- |
| `tour.root` | `div` | the family's state; `ui-open`, `ui-closed`, `ui-disabled`. **No `anchor-scope`, ever** |
| `tour.backdrop` | `div` | the spotlight - anchored to the current target, `box-shadow` dim, `pointer-events: none`, `hidden` with the tour |
| `tour.item` | `div` | one step: `target`, `side`. Renders the card one component deeper |
| `tour.title` | `h2` | the step's accessible name |
| `tour.description` | `p` | wired through `aria-describedby` |
| `tour.valuelabel` | `span` | "2 of 5", or the consumer's own text |
| `tour.backtrigger` / `tour.forwardtrigger` | `button` | previous / next, `disabled` at the ends |
| `tour.close` | `button` | dismisses the tour |

`tour.state()` per widget: `open`, `step` (an index), `count`, `target`, and
`next()`, `prev()`, `skip()`, `close()`. `tour.itemstate()` per step: `side`,
`target`.

Root props: `open`, `loop`, `closeOnInteractOutside`, `disabled`, `onChange`,
`onOpenChange`. Item props: `target`, `side`.

## The blocking gap: a step cannot learn its own place

The card is `hidden` unless it is the current step, and `step` is an index, so a
step has to know its ordinal at **render** time. Three routes exist in this
library and all three are closed:

1. **A plural `element()` handle as the registry**, the way `togglegroup` and
   `tree` use one. Measured on this tip, and the measurement is the finding:
   inside a `computed()`, `tour.itemEls` reads back empty and the item's own
   `item.el` reads back `undefined` - even after the graph has re-derived, since
   the same derivation reported the live `open` and `step` on the same pass. The
   identical read **from a handler** answers all three cards. So a plural handle
   is a handler-time registry only, exactly as `tree/note.md` says ("readable and
   indexable from any handler inside that widget"), and it cannot drive a
   render-time `hidden`. A `computed()` written in the shared factory over the
   same handle renders as the string `undefined`.
2. **A shared write from the item body**, the way `otp.item` registers
   `otp.length = index + 1`. That idiom works - a later part's write refreshes an
   earlier part's read, in both modes - but its right-hand side may not read the
   shared instance (`otp/note.md`: the SSR emitter copies the expression into the
   seed function verbatim, where the instance local is out of scope), so an item
   can only register a number it was **given**. `otp.item` is given one: it takes
   a required `index` prop. `tour.item`, as ruled, is given nothing ordinal.
3. **A creation-order counter.** Ruled out for this library twice, in
   `select/note.md` and `radio-group/note.md`: markless seeds are
   order-independent and there is no runtime construction-order counter.

So the ruled shape - one card per step, hidden unless current, `step` an index,
item props `target` and `side` - has no way to decide which card shows. This is
not the known handle-prop gap, which is about `target` reaching a handler: this
one bites before any target is involved, and it is red on a step with no target
at all. Re-measured after the handle-prop fix landed, and unchanged: that fix
routes a consumer's handle into the item's **handlers**, and the read that fails
here is a `computed()` derivation.

**The exact row:** `CSR/SSR: opening shows the first step alone, and closing puts
it away` in `tour.browser.ts`. Every other behavioural row fails behind it,
because none of them can open the tour.

**The decision needed, two options, both one word at the call site:**

- **An `index` prop on `tour.item`** - `otp.item`'s exact shape, and the direct
  consequence of `step` being an ordinal: `<tour.item index={0} target={saveEl}>`.
  Registration is then `tour.count = index + 1` and currency is
  `computed(() => tour.step === item.index)`, both shipped idioms.
- **A `value` prop on `tour.item`**, with `step` becoming that value. That is
  what `carousel`, `tabs`, `togglegroup`, `select` and `radio-group` all do, and
  what the research memo recommended before the index ruling. `count` and the
  ordinal in "2 of 5" still need route 2's registration, so this option needs an
  ordinal as well unless `valuelabel` is dropped.

## Compiler constraints this family met, so the next one does not rediscover them

- **Every graph read stands on its own line before it is used.** An expression
  that nests one under a call - `releaseTarget(tour.target)`,
  `(itemEls ?? []).length`, `stepAfter(tour.step, 1, cards.length, tour.loop)` -
  is emitted into the handler module as written and reported as
  `MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE`. Read into a local first,
  then build the expression out of locals.
- **Only a `state()` cell can be read in a handler.** A plain instance field, the
  way `popover` holds `onChange`, may be *called* (`tour.onChange?.(to)`) but not
  read as a value: `const leaving = tour.target;` on a plain field draws the same
  unresolved-reference report. `target` therefore lives in the `state()` seed on
  both instances.
- **A dynamic index into a graph-derived local is refused**
  (`MARKLESS_STATE_DYNAMIC_PATH_READ` on `cards[to]`), even when `cards` is an
  ordinary local. `carousel` gets away with `pickers[landed]?.focus()` because it
  never binds the result to a name; anything that needs the element passes the
  whole array to a plain helper and lets the helper index it. That is why
  `focusIntoCard(cards, to)` takes the array and the index.
- **A component may only forward-reference another same-module component from the
  module's first component.** `progress`, `radio-group`, `togglegroup` and
  `datebox` all declare their inner part immediately after the root, which is the
  module's first component, and compile. With `tour.item` sitting fourth,
  rendering a `TourCard` declared below it fails at module evaluation with
  `ReferenceError: Cannot access '__marklessSsrComponent0' before initialization`.
  Moving the item/card pair to the top of the module fixes it, which is why they
  are declared before the root here. `colorpicker` reaches the same place from the
  other side, declaring `ColorpickerAxis` above its caller.

## Anchoring, and the trap beside it

The card and the spotlight are both placed by CSS anchor positioning against a
name the family writes onto the consumer's own element with
`style.setProperty('anchor-name', …)`, through the handle the consumer bound. A
`<style>` block cannot reach that element - the scope class is minted only onto
elements this module renders - and there is no attribute to write either. Fluent
UI's tooltip does the identical write for its own anchor element.

The write keeps whatever name was already there in front of ours, because
`anchor-name` takes a list: a consumer who had already anchored their button keeps
that anchor and the card still finds `--tour-target`. Leaving a step puts the
original back, from a `WeakMap` keyed by the element, so nothing extra is written
on the consumer's element to remember it.

**Never put `anchor-scope` on `tour.root`.** Every other anchored family does
(`popover`, `tooltip`, `hovercard`), and copying that line is the single most
likely mistake here: a tour's target is outside the root's subtree by
construction, so scoping the name on the root hides it from the card instead of
isolating it. The gates measured both halves - a `popover` ancestor scoping
`--ui-popover` leaves every other name exported, and an ancestor scoping the
tour's own name breaks a card outside that subtree.

Because there is no scope, `--tour-target` is one global name. One tour at a time,
therefore, documented rather than defended: two open tours would stack both cards
on the second one's target.

## The spotlight is the hole, not the layer

`tour.backdrop` is a box the size and position of the target - `anchor(top)`,
`anchor(left)`, `anchor-size(width)`, `anchor-size(height)` - and the dim is its
own `box-shadow: 0 0 0 100vmax`. Intro.js's technique with the geometry moved into
CSS. Nothing measures a box, nothing listens for scroll or resize, and the colour,
corner radius and any transition stay ordinary declarations a consumer can replace
under `@layer markless`, because only geometry is written here.

`pointer-events: none` is not a preference. A `box-shadow` is not hit-testable and
the border box *is* the hole, so `auto` reads exactly backwards: the spotlight
swallows presses on the target it exists to reveal, and the dim passes them
through. The gates measured both readings. Nothing needs to catch presses anyway -
`overlay.ts` hears outside presses on a document capture listener, which is what
lets every reference's SVG mask be dropped.

## No `aria-modal`, and therefore no focus trap

The card is `role="dialog"` and **never** writes `aria-modal`, in any
configuration. The APG allows it only when application code prevents interaction
with everything outside, and a tour exists to say "click that one". And the
overlay behaviour derives modality from the attribute: writing it would mark the
spotlighted element `inert` - the one thing the person is being told to press -
and lock the scroll a tour needs to bring an off-screen target into view.

The cost, stated: `Tab` leaves the card and continues into the page. Containment
in this library comes free from `aria-modal`'s inerting, and writing our own trap
would mean asking the DOM for the card's focusable descendants, which
`modal/note.md` already refused in these words. Three real mitigations: Escape
closes from anywhere through the document listener; the card carries
`tabindex="-1"` and takes focus on a step change, so `Tab` from it enters the
card's own controls first; and the cards are late in `tour.root`. This is the
family's largest ARIA divergence and it is structural.

`role="dialog"`, not Zag's `alertdialog`: a tour step is neither brief nor an
alert.

## Dismissal, and where the target is known

The **card** carries `overlay`, not the backdrop. `modal` puts it on the backdrop
because a modal's backdrop is mandatory; a tour's is optional in every family that
has one, and two marked elements would double-enlist. The backdrop is purely
presentational.

A press whose `pressTarget` is inside the current step's own target never
dismisses - `handle.contains(pressTarget)` on the handle the consumer handed over,
the one containment predicate allowed - because otherwise the tour would close the
instant the person pressed the thing it told them to press. Escape always
dismisses. `closeOnInteractOutside` governs everything else.

**The incoming step's target reaches the family through focus, and that is not an
accident of implementation.** No lifecycle runs when a step becomes current, and
the incoming step's `target` lives in the incoming item's own instance, which no
handler on the outgoing card can reach. So `next()` and `prev()` land focus on the
incoming card, and the card's own `onFocus` is where the family names the anchor,
scrolls the target into view and publishes `tour.state().target`. The consequence
to record: a tour the consumer opens by flipping `open`, with no gesture the
family saw, has no anchor on its first target until that card takes focus - the
same shape `modal` already lives with for a controlled dialog, and what the
research memo predicted as the served-open gate.

## Keyboard

`ArrowRight` / `ArrowLeft` move a step and are prevented from scrolling, and they
act **only when the card host itself is the event target**. A consumer's own
listbox or slider inside a step therefore keeps its arrows unconditionally, and
there is no `keyboardNavigation` knob to get wrong. The `preventDefault()` guard
is a flat `===` chain over `event.key` alone, because a guard over graph-derived
locals is `MARKLESS_SYNC_POLICY_UNEXTRACTABLE`.

LTR only: `@markless/ui` has no locale source, the fourth family to record it.

## What v1 refuses

No `steps` array prop. The gates measured that an array of objects carrying a
handle is refused outright when a handler reads the array
(`MARKLESS_CAPTURE_OPAQUE_PROP`), and that reading it one index at a time compiles
and then crashes on the first press. A handle crosses a component edge as a bare
prop or not at all.

No `preventInteraction`: it needs `inert` on the target, which contradicts the
family's purpose. No `spotlightRadius` / `spotlightOffset`: those are
`border-radius` and `padding` in the consumer's own CSS, which is strictly more
expressive. No `type: 'tooltip' | 'dialog' | 'wait' | 'floating'` enum: a step
with no target anchors to nothing and the consumer's own ungated rule centres it,
a corner-pinned step is `position: fixed` in a stylesheet, and a step whose target
has not rendered yet simply has an unbound handle. No `dir`. No `trigger` part - a
tour is opened by the consumer flipping `open`, as `modal/scenarios/controlled`
does. No `spotlight` part distinct from `backdrop`: the technique collapses them.

No live region on the card. Zag writes `aria-live="polite"` because its single
card's contents change under stationary focus; here focus moves into the incoming
card on every step change, so the card announces itself and a live region would
only double it.

## Accessibility words, not visuals

The dim and the spotlight announce nothing - no role, no name,
`pointer-events: none` - and that is correct, because they are an effect. What
conveys which element a step means is `tour.description`, in words: "the Save
button in the toolbar" is accessible and "this button" is not. The scenarios are
written that way on purpose.

## Not registered, and not wired into the gallery

`src/index.ts`, the test-support conformance descriptor, the api manifest, the
package export and the sr-gallery section all belong to a follow-up unit. The
scenarios and the browser lane therefore import the family through `../index.ts`
rather than the library barrel, and a transcript file for the real readers should
spell its own gallery anchor rather than reading `FAMILY_ANCHORS`, the way
`togglegroup-transcript.ts` does.
