# drawer

Seven parts, all from the established role set and all already shipped by `src/modal/`: `root`,
`trigger`, `backdrop`, `content`, `title`, `description`, `close`. The anatomy is modal's -
`<drawer.backdrop><drawer.content/></drawer.backdrop>` - because the backdrop is the element that
carries `overlay`, the `hidden` gating and the dismissal reports, and the content is the element a
swipe moves.

The research that chose the behaviour is `goals/headless-components/notes/U684-drawer.md`: Base UI's
drawer, Ark UI's, and Vaul, which Base UI's descends from.

## What this family adds over modal

One thing: the surface can be dragged out of view, and it can rest part of the way open. Everything
else - dialog semantics, `aria-modal`, focus in and back, Escape, the two-phase backdrop press,
nesting - is modal's, and `src/modal/note.md` is the record for all of it.

## The four edges, without a placement prop

`orientation` picks the axis (`vertical` by default, the bottom sheet every reference defaults to)
and `start` picks which of that axis's two edges the drawer is anchored to. Together they cover all
four of the references' directions, in logical properties, so a right-to-left page gets the correct
side and the correct swipe direction without the consumer saying anything.

This is not the placement prop the spec bans. `side`/`align`/`offset` are banned because they are CSS
a consumer should write; which way a swipe closes a drawer is behaviour, and `closeSign()` is where
it lives.

## The displacement is a fraction, not pixels

`--offset` is unitless: how much of the drawer's own size is currently out of view. CSS multiplies it
by `100%` of the element, and the sign comes from the `ui-start` and `ui-orientation` attributes
rather than from JS.

That choice is what makes a rest position need no measurement. `snapPoints={[0.5, 1]}` renders
correctly on a drawer the server sent open, before any pointer has touched it, because 0.5 of the
element is something CSS can work out on its own. The family measures only when a gesture starts (and
on `focusin`, which is the route an opening drawer takes anyway).

A pixel snap point is the exception and it is a real limitation - see Finding 1.

## The release rule

Three numbers, all of them the references':

- `closeThreshold`, default `0.25` - Ark's and Vaul's, and they agree. A slow release closes the
  drawer once it has been pulled more than a quarter of the way past its lowest rest position.
- `VELOCITY_THRESHOLD`, `0.4` px/ms - Vaul's constant, kept as a constant rather than a prop, as it
  is there. Ark's equivalent is 700 px/s; the slower cutoff is the more forgiving one on a phone.
- Above that cutoff, a release steps exactly one rest position in its own direction and closes when
  there is none left below. Base UI makes this optional behind `snapToSequentialPoints` and defaults
  to letting a fast flick skip rest positions; here it is the only rule, because "one flick, one
  step" is the predictable one and nobody has asked for the other.

`drawer-swipe.ts` holds all of it as pure functions, and the browser suite pins each one directly -
this package runs no node project, so the arithmetic is pinned beside the markup the way crop's is.
The gesture rows declare the `timeStamp` of every pointer sample they dispatch, so a row that means
"this swipe was fast" says so in the samples the family divides by, rather than racing a timer.

## Where a swipe may start

**Only on the surface element itself, never on a descendant.** There is no handle part to restrict
the gesture to (below), and identifying a draggable descendant would mean either a DOM query or
reading a `data-*` attribute off consumer markup - Vaul's `data-vaul-no-drag`, Base UI's
`data-base-ui-swipe-ignore`, Ark's `data-no-drag` - and this library reaches other elements only
through handles it binds itself.

The practical effect is Vaul's `handleOnly` mode with the surface's own padding as the handle: a
button, a text selection or a scroll region inside the drawer is never a drag start, which is also
why the family needs none of Vaul's `scrollLockTimeout` machinery.

## Arrow keys over the rest positions

No reference library gives a keyboard any way to reach an intermediate rest position - a drawer
resting at 0.5 is stuck there for anyone not using a pointer, in Base UI, Ark and Vaul alike. Here an
arrow key along the drawer's own axis steps one rest position, guarded to presses that target the
surface itself so a control inside the drawer keeps its own arrows. `keyIntent()` derives the mapping
from the closing direction rather than writing it out four times, so a top sheet and a right-to-left
side panel are correct without a table.

The keys do nothing when there is one rest position, which is the default.

## Modal and not

`modal` (default `true`) writes `aria-modal="true"` on the surface. That attribute is what the
overlay behaviour reads off the enlisted subtree at the moment the backdrop enlists, and that read is
what takes the page behind out of reach and locks the document scroll (`src/modal/note.md`). Dropping
it is Base UI's and Ark's non-modal mode, in one attribute. Base UI's third value, `'trap-focus'`, is
not carried: it is a mode enum, and the capability-naming rules take booleans over enums.

## CSS defaults

Two `<style>` blocks under `@layer markless`, keyed off the `ui-*` attributes the parts already
write. The backdrop is a fixed full-viewport layer; the surface is fixed to its edge, translated by
`--offset`, and carries `touch-action: none` so the browser does not claim the pan before the family
sees it and `overscroll-behavior: contain` so a swipe that runs out of drawer does not rubber-band the
page behind - the iOS webview failure this family was asked for.

`touch-action` is not an inherited property, but the browser intersects the values along the ancestor
chain when it decides what a touch pans, so **a scroll region inside a drawer must set its own
`touch-action: pan-y`**. This is the same tradeoff Vaul spends `scrollLockTimeout` on, paid in one
line of consumer CSS instead of a timer.

The surface owns its `style` attribute, so size and skin it from a stylesheet rather than a `style`
prop; the scenarios put the size on a child instead.

## Finding 1 - a pixel rest position needs a measurement the family only takes during a gesture

`snapPoints={[160]}` has to be divided by the surface's measured size to become the fraction
`--offset` speaks, and the family measures on `pointerdown` and on `focusin`. Before either has
happened, `openFractionOf()` resolves a pixel snap to fully open rather than to nowhere. Fractional
rest positions have no such problem and are the documented default; Base UI and Vaul both accept
pixel and `rem` snap points and both measure eagerly to do it.

## Finding 2 - a drawer served already open never enlists

Carried unchanged from `src/modal/note.md` Finding 4. The overlay behaviour enlists an element that
_becomes_ shown and deliberately never enlists one that was shown at first render, so a served
`<drawer.root open>` renders correct dialog markup and gets none of the mechanics: the background is
not inert, the page is not locked, and Escape reaches nothing. Pinned by `SSR: a drawer served open
renders drawer markup but never enlists`, which asserts what actually happens.

## Not shipped, and why

| Reference feature                                                      | Why not                                                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `Portal`, `Positioner`, `Viewport`                                     | the spec names all three as explicitly-not-roles                                                        |
| `SwipeArea` - swipe in from the screen edge to _open_                  | a second gesture vocabulary on an element outside the drawer; a follow-up                               |
| `Indent`, `IndentBackground`, `shouldScaleBackground`                  | scaling the page behind is consumer CSS over `ui-open`; the family never moves what it does not own     |
| Vaul's `Handle`, Ark's `Grabber`                                       | no role for it - the open question below                                                                |
| `data-*` opt-out for drag                                              | consumer-authored attributes are not a surface the family reads                                         |
| `snapToSequentialPoints`                                               | the sequential rule is the only rule shipped                                                            |
| `fadeFromIndex`, `TRANSITIONS`, `BORDER_RADIUS`, `NESTED_DISPLACEMENT` | animation and nested displacement are consumer CSS                                                      |
| Vaul's `NestedRoot` and `nested`                                       | its root is a context provider; ours is a `shared()` with `scope: 'widget'`, so nesting is just nesting |

## Open questions

1. **A grab-bar part.** Ark ships `Grabber` (plus `GrabberIndicator`), Vaul ships `Handle`. The spec
   has no `handle` or `grabber` role, and `thumb` - "the handle a person drags along a track" - is
   ruled for slider, whose thumb sits on a track this one does not have. Minting a role needs three
   use cases and owner sign-off, so the part is left out and the drag-source ruling above stands in
   its place. This is the one part name that needs a ruling.
2. **`start` as a capability name.** `orientation` is the enum shape the spec blesses. `start` is a
   new boolean in the same grammar as `crop.thumb`'s `inlineStart`/`blockStart` and the spec's own
   `ui-side="start"` example, but it is not itself an established name.
3. **Registration.** Done, except the conformance battery: the barrel, the package export map, the
   api manifest, the sr-app section and the three CI reader matrices all carry `drawer`, the
   scenarios import the consumer form `import { drawer } from '../../index.ts'`, and
   `drawer-transcript.ts` reads `FAMILY_ANCHORS.drawer`. The conformance descriptor in
   `test-support/` is the one piece still outstanding.
