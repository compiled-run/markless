# U684 — drawer research memo

Owner brief (2026-08-28): "research and do headless Drawer. Because of the swipe behavior, which is
helpful on the web and for webviews in iOS, and if the codebase becomes compilable for native it
could work there too."

References read: [Base UI Drawer](https://base-ui.com/react/components/drawer),
[Ark UI Drawer](https://ark-ui.com/docs/components/drawer), and
[Vaul](https://github.com/emilkowalski/vaul) — Base UI's drawer descends from Vaul, and Ark's is a
Zag machine covering the same ground. Vaul's numbers were read from its published type declarations
(`vaul@1.1.2/dist/index.d.mts`) and its `src/constants.ts`.

## What each reference ships

| | Base UI | Ark UI | Vaul |
| --- | --- | --- | --- |
| Parts | `Provider`, `IndentBackground`, `Indent`, `Root`, `Trigger`, `SwipeArea`, `VirtualKeyboardProvider`, `Portal`, `Backdrop`, `Viewport`, `Popup`, `Content`, `Title`, `Description`, `Close` | `Root`, `Trigger`, `Backdrop`, `Positioner`, `Content`, `Grabber`, `GrabberIndicator`, `Title`, `Description`, `CloseTrigger`, `SwipeArea`, `IndentBackground`, `Indent`, `RootProvider` | `Root`, `NestedRoot`, `Trigger`, `Portal`, `Overlay`, `Content`, `Handle`, `Title`, `Description`, `Close` |
| Direction | `swipeDirection: 'up'\|'down'\|'left'\|'right'`, default `'down'` | `swipeDirection`, default `'down'` | `direction: 'top'\|'bottom'\|'left'\|'right'`, default `'bottom'` |
| Snap points | `snapPoints: (number\|string)[]`; 0–1 = fraction of viewport, >1 = px, strings in `px`/`rem` | `snapPoints`, default `[1]` | `snapPoints: (number\|string)[]`, documented as "% of the screen" |
| Active snap | `snapPoint` + `onSnapPointChange` | `activeSnapPoint` on the machine | `activeSnapPoint` + `setActiveSnapPoint` |
| Skip on velocity | on by default; `snapToSequentialPoints` turns it off | velocity threshold 700 px/s | `snapToSequentialPoint`, default `false` |
| Dismiss threshold | not a prop | `closeThreshold`, default `0.25` | `closeThreshold`, default `0.25` (`CLOSE_THRESHOLD`) |
| Velocity threshold | not a prop | 700 px/s = 0.7 px/ms | `VELOCITY_THRESHOLD = 0.4` px/ms |
| Drag source | whole popup; opt out per element with `data-base-ui-swipe-ignore` | whole content; opt out with `data-no-drag`; `draggable` default `true` | whole content; `handleOnly` (default `false`) restricts it to `Drawer.Handle` |
| Scroll during drag | — | `preventDragOnScroll`, default `true` | `scrollLockTimeout`, default 500 ms prop / `SCROLL_LOCK_TIMEOUT = 100` constant |
| Scroll lock | `modal={true}` locks document scroll; `modal='trap-focus'` traps focus without locking | `preventScroll`, default `true` | `disablePreventScroll`, default `false`; `noBodyStyles`, `preventScrollRestoration` |
| Nested | stacking; `data-nested-drawer-open`, `--nested-drawers` | `--nested-drawers`, `--nested-layer-count` | `Drawer.NestedRoot`, `NESTED_DISPLACEMENT = 16` |
| Modal vs not | `modal: boolean \| 'trap-focus'`, default `true` | `modal`, default `true` | `modal`, default `true` |
| Handle | `Drawer.createHandle()` — an imperative open/close object, **not** a grab bar | `Grabber` + `GrabberIndicator` — the grab bar | `Drawer.Handle` — the grab bar, with `preventCycle` |
| Backdrop | `Backdrop`, publishes `--drawer-swipe-progress` | `Backdrop` | `Overlay` |
| Transition | — | — | `TRANSITIONS = { DURATION: 0.5, EASE: [0.32, 0.72, 0, 1] }`, `BORDER_RADIUS = 8`, `WINDOW_TOP_OFFSET = 26` |

Note the name collision: Base UI's `handle` is an imperative controller object, while Ark's `Grabber`
and Vaul's `Handle` are the visible bar a thumb pulls. Only the second is a part.

## Accessibility each provides

All three land on the same shape, and it is the shape `src/modal/` already ships:

- `role="dialog"` on the surface (Ark also allows `alertdialog`); never the native `<dialog>` and
  never the top layer.
- `aria-modal="true"` while modal, absent when not.
- `aria-labelledby` → the title part, `aria-describedby` → the description part.
- Focus trapped inside the surface while modal (Ark `trapFocus`, default `true`; Base UI's
  `modal='trap-focus'` keeps the trap and drops the scroll lock).
- Focus returned to the trigger on close (Ark `restoreFocus`, default `true`; Base UI `finalFocus`).
- Escape closes (Ark `closeOnEscape`, default `true`).

None of the three gives a keyboard user any way to reach an intermediate snap point. Snap points are
a pointer-only affordance in every reference. That gap is recorded as a finding below, and this
family closes it.

## Naming, against `packages/headless/components/SPEC.md`

Parts shipped, all from the established role set, all already used by `src/modal/`:
`root`, `trigger`, `backdrop`, `content`, `title`, `description`, `close`. The anatomy is modal's —
`<drawer.backdrop><drawer.content/></drawer.backdrop>` — because the backdrop is the element that
carries `overlay` and the `hidden` gating.

**Not shipped, and an owner question: the grab bar.** Ark calls it `Grabber`, Vaul calls it `Handle`.
SPEC has no `handle` or `grabber` role, and the nearest established role — `thumb`, "the handle a
person drags along a track" — is ruled for slider and the drawer's bar sits on no track. Minting a
role needs three use cases and owner sign-off, so the part is left out and the question is raised.
Its absence is what forces the drag-source ruling below.

Capability names:

- `orientation: 'horizontal' | 'vertical'`, default `'vertical'` — the one enum shape SPEC blesses,
  and it does here exactly what the charter says: it selects an axis. `swipeDirection` and
  `direction` are both rejected — a four-valued enum is the mode prop SPEC bans, and `direction`
  collides with the CSS/HTML property of that name.
- `start: boolean`, default `false` — the drawer is anchored at the start edge of its axis
  (block-start for vertical, inline-start for horizontal) rather than the end edge. Booleans over
  enums, and the logical-edge word the repo already speaks (`crop.thumb`'s `inlineStart`/`blockStart`,
  SPEC's own `ui-side="start"` example). Together with `orientation` this covers all four of the
  references' directions, and it covers them in logical properties, so a right-to-left page gets the
  correct edge for free where Vaul's physical `left`/`right` does not.
- `snapPoints`, `snapPoint`, `defaultSnapPoint`, `onSnapPointChange` — Base UI's spelling, carried
  over because it already fits the repo's `value`/`defaultValue`/`onChange` shape (`src/crop/`).
  `activeSnapPoint` is not carried: the adjective is doing no work next to `snapPoints`.
- `closeThreshold` — Ark's and Vaul's name, kept.
- `modal: boolean`, default `true`. Base UI's third value `'trap-focus'` is not carried; that is a
  mode enum.
- `onChange(open)` is the primary callback, per SPEC and per `src/modal/`. `onSnapPointChange` is the
  secondary one, in the `onOpenChange`/`onChangeEnd` grammar.

`ui-*` attributes: `ui-open` / `ui-closed` (modal's), `ui-orientation` (slider's), `ui-start`
(presence, crop's `ui-inline-start` precedent), `ui-dragging` (crop's, slider's), `ui-backdrop`,
`ui-content`. One custom property, `--offset` — SPEC's own named geometry property.

## Researched defaults

**Direction.** Bottom by default: `orientation="vertical"`, `start` absent. Every reference defaults
to the bottom sheet and that is what an iOS webview wants.

**Snap points.** `snapPoints` defaults to `[1]` (Ark's default): one rest position, fully open. A
value in `(0, 1]` is a fraction **of the drawer's own size**, not of the viewport; a value above 1 is
pixels, converted against the measured size. The divergence from Vaul's "% of the screen" is
deliberate: the family publishes rest positions as a unitless `--offset` that CSS multiplies by
`100%` of the element, so a fraction of the drawer needs no measurement at all and therefore works on
a drawer the server sent open. A pixel snap does need the measurement, and until a gesture has taken
one it resolves to fully open — recorded as Finding 3.

**Dismiss threshold and velocity.** `closeThreshold` defaults to `0.25` — Ark's and Vaul's number,
and they agree. The velocity cutoff is `0.4` px/ms, Vaul's `VELOCITY_THRESHOLD`, and it is a module
constant rather than a prop, exactly as Vaul has it; Ark's 700 px/s (0.7 px/ms) is the outlier and
the slower cutoff is the more forgiving one on a phone. A flick faster than the cutoff moves one snap
point toward its direction and closes the drawer when there is none left; a slow release lands on the
nearest snap point, and closes only when the drawer has been pulled more than `closeThreshold` of the
way past its lowest snap point. Velocity skipping is therefore off — Base UI's `snapToSequentialPoints`
behaviour is the default here, because "one flick, one step" is the predictable rule and nobody has
asked for the other one.

**Drag from content vs handle.** The gesture starts only on a press whose target **is** the content
element itself, never a descendant. Two reasons. There is no `handle` part to restrict it to (above),
and identifying a draggable descendant would mean either a DOM query or reading a `data-*` attribute
off consumer markup — Vaul's `data-vaul-no-drag`, Base UI's `data-base-ui-swipe-ignore`, Ark's
`data-no-drag` — and the family reaches other elements only through handles it binds. The practical
effect is Vaul's `handleOnly` mode with the content's own padding as the handle: a button, a text
selection or a scrollable list inside the drawer is never a drag start. This is the ruling the
`handle` question would reopen.

**Scroll lock and iOS overscroll.** Nothing new: `aria-modal="true"` on the content is what the
overlay behaviour reads at enlist, and that read is what locks the document scroll and takes the rest
of the page out of reach (`src/modal/note.md`). Dropping `modal` drops the attribute and with it the
lock, which is Base UI's and Ark's non-modal mode. The two touch defaults ship as CSS in the family's
`@layer markless` block, not as JS: `touch-action: none` on the content so the browser does not claim
the vertical pan before the family sees it, and `overscroll-behavior: contain` so a drag that reaches
the end of the drawer does not rubber-band the page behind — the iOS webview failure the owner named.
The cost is the one Vaul's `scrollLockTimeout` exists to pay: a scrollable region inside a drawer must
set its own `touch-action: pan-y`. Recorded in `src/drawer/note.md`.

**Nested drawers.** SPEC "Recursive composition": a `drawer.root` inside a `drawer.content` recurses
with the same parts and roots its own widget-scoped instance. There is no `NestedRoot` and no
`nested` prop — Vaul needs both because its root is a context provider; ours is a `shared()` with
`scope: 'widget'`. The visual displacement Vaul draws with `NESTED_DISPLACEMENT = 16` is consumer CSS
over `ui-open` on the outer root.

**Non-modal mode.** `modal={false}`. The surface still elevates and still dismisses, and the page
behind stays reachable and scrollable. It is the same one-attribute switch as above.

## Divergences from the references, with their reasons

| Reference feature | Here | Why |
| --- | --- | --- |
| `Portal`, `Positioner`, `Viewport` | not parts | SPEC names `portal`, `positioner` and `viewport` as explicitly-not-roles |
| `SwipeArea` (swipe to *open* from the screen edge) | not shipped | needs an edge-anchored element outside the drawer and a second gesture vocabulary; a follow-up, and `area` is an established role if it earns it |
| `Indent` / `IndentBackground` / `shouldScaleBackground` | not shipped | scaling the page behind is styling over `ui-open`, and the family never moves what it does not own |
| `GrabberIndicator` | not shipped | it is the child of a part that does not exist yet |
| `data-*` opt-out for drag | not shipped | consumer-authored attributes are not a surface the family reads |
| `snapToSequentialPoints` | not a prop | the sequential rule is the only rule shipped |
| `fadeFromIndex`, `TRANSITIONS`, `BORDER_RADIUS` | not shipped | animation is consumer CSS |
| Arrow keys step snap points | shipped, no reference has it | see Finding 1 |

## Findings

**Finding 1 — snap points are pointer-only in every reference.** A drawer resting at 0.5 of its
height cannot be expanded or collapsed from the keyboard in Base UI, Ark or Vaul. This family gives
the content arrow keys along its own axis when more than one snap point is configured, stepping one
snap point per press, guarded to presses that target the content itself so a control inside the
drawer keeps its own arrows. It is an addition to the references, not a carry-over.

**Finding 2 — a drawer the server sent open gets markup but no mechanics.** Carried straight from
`src/modal/note.md` Finding 4: the overlay behaviour enlists an element that *becomes* shown and
deliberately never enlists one shown at first render. A served `<drawer.root open>` is therefore not
modal, not scroll-locked, and Escape reaches nothing. Pinned by a row that asserts what actually
happens.

**Finding 3 — a pixel snap point needs a measurement the family only takes during a gesture.** Rest
positions are published as a unitless `--offset` so CSS can do the arithmetic against the element's
own size; a pixel snap has to be divided by a measured size to become that fraction, and the family
measures on `pointerdown`. Before the first gesture a pixel snap therefore resolves to fully open.
Fractional snap points have no such problem and are the documented default.

**Finding 4 — `touch-action: none` on the content reaches scrollable descendants.** The property is
not inherited, but the browser intersects the values along the ancestor chain when deciding what a
touch pans, so a scroll region inside the drawer must re-declare `touch-action: pan-y`. This is the
same tradeoff Vaul spends `scrollLockTimeout` on; here it is one line of consumer CSS instead of a
timer.

## Open questions for the owner

1. **A grab-bar part.** Ark ships `Grabber`, Vaul ships `Handle`. SPEC has no role for it and `thumb`
   is ruled for slider's track. Mint a role, extend `thumb`, or leave the content's padding as the
   grab area? The drag-source ruling above depends on the answer.
2. **`start` as a capability name.** `orientation` is SPEC's blessed enum; `start` is a new boolean
   in the same grammar as `crop.thumb`'s `inlineStart`/`blockStart` and SPEC's `ui-side="start"`
   example, but it is not itself an established name.
