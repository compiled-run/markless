# Popover (and modal) — component research for `@markless/ui`

**Research date:** 2026-08-22
**Method:** `.ruler/skills/markless-component-research/SKILL.md`
**QDS reference read:** `~/dev/open-source/qwik-design-system/libs/components/src/popover/` and
`.../modal/` (READ-ONLY)
**Markless facts read from:** the shared checkout on `feat/headless-ui-pilot` (session snapshot head
`7c87ecf5`), plus first-hand reads of `packages/compiler/src/artifacts.ts` and the semantic-graph
passes in this worktree (`main` @ `8efcaef5`).

**This document carries the cluster's shared deliverable.** §7 is the **overlay-primitive
requirements memo** — what popover, modal, tooltip and toast genuinely need from the framework, what
is already met by landed capabilities, and what is genuinely new. The other three documents
(`research-collapsible.md` §8, `research-tooltip.md` §8, `research-toast.md` §8) each contribute a
section that §7 consolidates. Read §7 on its own if that is what you came for.

---

## 1. Name and alternates

Searched under: popover, popup, dropdown, flyout, floating panel, overlay, hovercard, dialog, modal,
lightbox, sheet, drawer, non-modal dialog.

- **Popover** is settled: Base UI, Ark UI, Radix, Kobalte, Bits UI, Corvu, React Aria (`Popover`),
  Melt, Dice UI, QDS. It is also, since 2023, a **platform** name — `popover` is an HTML global
  attribute — which makes it the one family in this migration whose library name and platform name
  collide. That collision is a feature (§7) and a documentation hazard (§10).
- **Dialog / Modal** is the second name in this document. QDS calls its family `modal`; every tier-1
  library calls it `dialog` (Base UI `Dialog`, Ark UI `Dialog`, Radix `Dialog`, Kobalte `Dialog`,
  React Aria `Dialog`/`Modal`). The APG pattern is "Dialog (Modal)". **`modal` is an adjective, not
  a thing** — Roselli's *Stop Using 'Pop-up'* argues exactly this class of point about overlay
  naming. §8 recommends keeping the QDS name anyway, and says why.
- **Alert dialog** is a variant, not a family: `role="alertdialog"`, `aria-describedby` required,
  focus on the least destructive control. QDS does not implement it (its own `research.mdx` lists it
  as a target feature that never landed). It is a one-prop difference for us (§8).
- **Dropdown / flyout / menu** — `menu` is owner-excluded, and a dropdown *menu* is a menu, not a
  popover. A dropdown that is not a menu (a filter panel, a profile card) is a popover. Nothing to
  add.
- **Hovercard / preview card** — a popover opened by hover with content richer than a tooltip. Radix
  and Base UI ship it as a separate `HoverCard`; QDS folds it into popover via `hover`, `delay`,
  `closeDelay`, `hoverGroup`. Not in the tranche list as a family; the hover machinery is discussed
  in `research-tooltip.md`.
- **Sheet / drawer / lightbox** — Roselli's *Should a Dialog Close When Clicked Outside?* (2026-08)
  calls these "weird patterns" and declines to give them a universal answer. Out of scope; they are
  a modal with different CSS.
- **Alternative-named implementations** worth crediting:
  - **`facebook/astryx`** ships a `useLayer` primitive whose `lightDismiss` prop *is* the choice
    between `popover="auto"` and `popover="manual"`, with a comment reconciling "browser-initiated
    closes (light-dismiss, `popover="auto"` stack eviction)" back into framework state. It is the
    cleanest statement found of the architecture QDS is also reaching for.
  - **`microsoft/fluentui`'s `react-headless-components-preview`** renders its popover surface as
    `<dialog popover="auto">` so one element supports both `showPopover()` and `showModal()`,
    switched by a `trapFocus` prop. That is a genuinely novel unification of §8's two families and it
    deserves consideration on its own merits (§10 question 3).

---

## 2. QDS reference (naming truth)

### popover

```
popover-root.tsx  popover-trigger.tsx  popover-content.tsx
anchor-logic.css  hooks/use-popover-hover.ts
math/hover-delay.ts  math/hover-delay.unit.ts  math/safe-polygon.ts  math/safe-polygon.unit.ts
index.ts  research.mdx (empty: "## Inspiration\n- []")  popover.browser.tsx
```

```ts
export { PopoverRoot as root }       from "./popover-root";
export { PopoverTrigger as trigger } from "./popover-trigger";
export { PopoverContent as content } from "./popover-content";
```

**Three parts: root, trigger, content.** No portal, no positioner, no arrow, no backdrop, no title,
no description, no close. That is a much smaller inventory than every tier-1 library (§3), and §7
explains why: QDS pushed the missing parts down into the platform.

What QDS actually implements:

| Concern | QDS behaviour |
| --- | --- |
| Elevation | `popover="auto"` on the content host (`popover-content.tsx:31`). Native top layer. Not a portal, not a z-index. |
| Trigger→content link | `popovertarget={panelId}` on the trigger (`popover-trigger.tsx:20`), where `panelId` is `` `${localId}-panel` `` from `useId()` |
| Show/hide | a task tracking `isOpen` calls `contentRef.value.showPopover()` / `.hidePopover()` (`popover-content.tsx:13-25`) |
| Browser→state sync | `onToggle$` reads `e.newState === "open"` and writes `isOpen` (`popover-content.tsx:9-11`). **The browser is the source of truth for closing.** |
| Positioning | CSS only: `anchor-scope`/`anchor-name`/`position-anchor`/`anchor()`/`anchor-size()`/`position-try: normal flip-block` in `anchor-logic.css`, injected with `useStyles$` |
| Positioning fallback | `@oddbird/css-anchor-positioning/fn` polyfill, loaded **conditionally** — `!("anchorName" in document.documentElement.style)` — and skipped entirely when the content computes to `position: fixed` (`popover-root.tsx:91-112`) |
| First-paint guard | `isHidden` starts `true`; the content renders `hidden` until the polyfill decision resolves, then unhides (`popover-root.tsx:72,111`) |
| Open-on-render | an explicitly-apologised `useVisibleTask$` (`"AVOID THIS UNLESS YOU REALLY KNOW WHAT YOU ARE DOING"`) that calls `showPopover()` after mount, only when the root was born open (`popover-root.tsx:156-177`) |
| Why it opened | `openReason: "hover" \| "click" \| "keyboard" \| "programmatic"`, with `e.detail === 0` distinguishing keyboard activation from a mouse click |
| Hover | `hover`, `delay` (default 200ms), `closeDelay` (default 0), `hoverGroup` — see `research-tooltip.md` §2 |
| Root element | `ui-open`/`ui-closed`, `ui-qds-popover-root`, `styleBoundary` |

`popover.browser.tsx` is 25 browser tests plus 4 `SafePolygonTracker` unit-shaped tests: click
toggle, Enter and Space toggle, Escape closes, **backdrop click closes "in auto mode"**, initial
`open`, external signal and external store, `onChange$`, `popovertarget` present, `popover="auto"`
present, trigger/content id linkage, two-popover rapid hover switch, hover popover still closes on
click, `closeDelay` grace period.

### modal

```
modal-root.tsx  modal-trigger.tsx  modal-content.tsx
modal-title.tsx  modal-description.tsx  modal-close.tsx
modal.css  index.ts  research.mdx  modal.browser.tsx
```

**Six parts: root, trigger, content, title, description, close.**

| Concern | QDS behaviour |
| --- | --- |
| Elevation | native `<dialog>` + `showModal()` (`modal-root.tsx:86`). **A different mechanism from popover's** — top layer via dialog, not via the popover attribute. |
| Content element | a literal `<dialog>` (not `Render`/`fallback`), so it is not polymorphic |
| Labelling | `aria-labelledby` / `aria-describedby` set **only if** a title/description part mounted — the root holds `isTitle`/`isDescription` booleans that `ModalTitle`/`ModalDescription` set in `useConstant` (`modal-title.tsx:12-14`, `modal-content.tsx:69-70`) |
| Backdrop dismiss | hand-rolled: `pointerdown` records whether the press started outside the dialog's `getBoundingClientRect()`, `pointerup` closes only if it *also* ended outside (`modal-content.tsx:7-56`). The two-event guard is deliberate — it stops a text selection that drags out of the dialog from closing it. |
| `closeOnOutsideClick` | root prop, **default `true`** |
| Escape | free from `<dialog>`; `onClose$` writes `isOpen = false` so the browser's Esc stays in sync |
| Scroll lock | `@fluejs/noscroll` + `initTouchHandler`/`resetTouchHandler`, `markScrollable(contentRef)` |
| Nesting | `level = (parentContext?.level ?? 0) + 1`; only level 1 restores page scroll on cleanup |
| Trigger | `aria-haspopup="dialog"`, toggles `isOpen` |
| Styling | `dialog:modal { max-width: unset; max-height: unset; }` — undoing the UA's default clamp |

`modal.browser.tsx` is 31 tests: open/close, trigger click, backdrop press outside,
**drag-from-inside-to-outside does not close**, **keyboard-triggered pointer events do not close**,
Escape, `body` overflow hidden and restored, nested modals keep the scroll lock, nested modal opens
with Enter, **Escape closes only the top modal**, focus goes to the first focusable element, focus
traps, `aria-labelledby`/`aria-describedby` present and absent, `closeOnOutsideClick={false}`,
clicks inside do not close, and the `ui-open`/`ui-closed` block.

### The five things QDS gets right that we should keep

1. **Two mechanisms, chosen per family, not one abstraction.** Popover uses the popover attribute;
   modal uses `<dialog>`. QDS did not build a shared "floating layer" and it did not need one.
2. **The browser is the source of truth for closing.** `onToggle$` and `onClose$` write *back* into
   state rather than state driving a hand-rolled dismiss. Every light-dismiss edge case the platform
   already handles is then free.
3. **Positioning is entirely CSS.** No `placement` prop, no measurement, no `useFloating`. The owner
   has already ruled this the Markless position too.
4. **The polyfill is conditional and feature-detected**, not unconditional.
5. **The backdrop-click guard is `pointerdown` + `pointerup`, not `click`.** Two of QDS's 31 modal
   tests exist because of drag-select and keyboard-synthesised pointer events. Copy the guard *and*
   the tests.

### The five things worth not copying

1. **`ui-qds-*` identity attributes** — already deleted by convention. Note that popover's CSS
   *selects on them* (`[ui-qds-popover-trigger] { anchor-name: --qds-popover; }`), so removing them
   means our anchor CSS must select on something else (§8).
2. **`width: 10em` on the trigger** in `anchor-logic.css` — a hard-coded size in a headless
   library's stylesheet. Almost certainly a demo leftover.
3. **`{...rest}` spread order on the popover root** is fine, but `<dialog {...props}>` in
   `modal-content.tsx:64` spreads **first** and then sets `aria-labelledby` after — same
   overwritability issue as QDS tabs, in the other direction. Our convention fixes it.
4. **`openReason`** is four-valued state that nothing in the public API exposes; it exists to let the
   hover machinery ignore its own opens. Keep the behaviour, question the four-valued cell.
5. **The `useVisibleTask$` for born-open popovers** is a Qwik-specific escape hatch with its own
   apology comment. In our model a born-open popover is a seed, and §8 argues it should be handled
   by the same seed phase as everything else — but see §10 question 5, because "call `showPopover()`
   at mount" is genuinely a post-render action.

---

## 3. Headless library survey

Fetched 2026-08-22.

### Popover

| Library | Parts | Elevation mechanism | Positioning | Dismiss |
| --- | --- | --- | --- | --- |
| **Base UI** (v1.7.0) | `Root`, `Trigger`, `Portal`, `Positioner`, `Popup`, `Arrow`, `Title`, `Description`, `Close`, `Backdrop`, `Viewport` (**11**) | React portal | **JavaScript** (Floating UI): `side: 'bottom'`, `align: 'center'`, `sideOffset`, `collisionBoundary: 'clipping-ancestors'` | Escape, outside click; `modal: false \| true \| 'trap-focus'` |
| **Ark UI** (Zag) | `Root`, `Trigger`, `Positioner`, `Content`, `Arrow`, `Title`, `Description`, `CloseTrigger` | portal | JavaScript (Floating UI) | Escape, outside click, `modal` |
| **Radix UI** | `Root`, `Trigger`, `Portal`, `Content`, `Arrow`, `Close`, `Anchor` | portal | JavaScript (Floating UI) | Escape, outside click, `modal` |
| **Kobalte** | `Root`, `Trigger`, `Portal`, `Content`, `Arrow`, `Title`, `Description`, `CloseButton`, `Anchor` | portal | JavaScript (Floating UI) | Escape, outside click, `modal` |
| **React Aria** | `DialogTrigger`, `Popover`, `Dialog`, `OverlayArrow` | portal + `Overlay` | JavaScript (own overlay positioning) | Escape, outside click, `isNonModal` |
| **Bits UI** | `Root`, `Trigger`, `Portal`, `Content`, `Arrow`, `Close` | portal | JavaScript (Floating UI) | Escape, outside click |
| **Fluent UI (headless preview)** | `Popover`, `PopoverTrigger`, `PopoverSurface` | **`<dialog popover="auto">`, native top layer** | `usePositioning`, with a CSS-anchor variant in stories | **the browser's light dismiss**, mirrored back via `toggle` |
| **QDS** | `root`, `trigger`, `content` (**3**) | **`popover="auto"`, native top layer** | **CSS anchor positioning** + conditional polyfill | **the browser's light dismiss**, mirrored back via `toggle` |

### Dialog / modal

| Library | Parts | Element | Focus | Dismiss |
| --- | --- | --- | --- | --- |
| **Base UI** | `Root`, `Trigger`, `Portal`, `Backdrop`, `Viewport`, `Popup`, `Title` (`<h2>`), `Description` (`<p>`), `Close` | **`<div role="dialog">`, not `<dialog>`** | `initialFocus` (default: first tabbable), `finalFocus` (default: trigger) | Esc; backdrop click unless `disablePointerDismissal`; `modal: true \| false \| 'trap-focus'` |
| **Ark UI** | `Root`, `Trigger`, `Backdrop`, `Positioner`, `Content`, `Title`, `Description`, `CloseTrigger` | `div` + `role` | `initialFocusEl`, `finalFocusEl` | `closeOnEscape`, `closeOnInteractOutside`, `modal` |
| **Radix** | `Root`, `Trigger`, `Portal`, `Overlay`, `Content`, `Title`, `Description`, `Close` | `div` + `role` | `onOpenAutoFocus`, `onCloseAutoFocus` | `onEscapeKeyDown`, `onPointerDownOutside`, `modal` |
| **React Aria** | `DialogTrigger`, `Modal`, `ModalOverlay`, `Dialog`, `Heading` | `div` + `role` | own `FocusScope` | `isDismissable`, `isKeyboardDismissDisabled` |
| **QDS** | `root`, `trigger`, `content`, `title`, `description`, `close` | **native `<dialog>` + `showModal()`** | the browser's | Esc (browser), backdrop press guard, `closeOnOutsideClick` |

### The finding that matters most

**QDS is a minority of two.** Of the eight popover implementations surveyed, exactly two — QDS and
Fluent UI's headless preview — use the native popover attribute for elevation, and exactly one (QDS)
uses CSS anchor positioning for placement. Six use a React/Solid/Svelte portal plus Floating UI. On
the dialog side, QDS is a minority of one: everybody else renders `<div role="dialog">` and
hand-builds the focus trap, the backdrop, and the inertness.

Two honest readings of that, and the memo in §7 needs both:

- **The charitable reading (and the one the evidence supports).** The tier-1 libraries were designed
  before `popover`, `<dialog>` and anchor positioning were usable, and they are locked in by API
  compatibility. Their `Portal` and `Positioner` parts are *workarounds for missing platform APIs*
  that have since arrived: `Portal` exists because there was no top layer, `Positioner` exists
  because there was no `anchor()`, `Backdrop` exists because there was no `::backdrop`, focus traps
  exist because there was no `inert`. Scott O'Hara's 2019 conclusion — "don't use native `<dialog>`
  in production, use a11y-dialog" — is exactly the era those APIs were designed in, and it is now
  seven years old.
- **The uncharitable reading, which must be tested and not waved away.** Fewer parts means fewer
  escape hatches. Base UI's eleven popover parts are eleven places a consumer can intervene; our
  three are three. When the platform's behaviour is wrong for a use case (§4 has real examples), a
  platform-first library has no lever. §7 lists exactly which levers we lose.

### Numbers, because "the platform is ready now" needs a number

Read from caniuse, 2026-08-22:

| Feature | Global | Chrome/Edge | Firefox | Safari / iOS |
| --- | --- | --- | --- | --- |
| `popover` attribute | **91.5%** | 114+ | 125+ | 17.0+ / 17.0+ |
| CSS anchor positioning | **84.12%** | 125+ | 147+ (145–146 behind a flag) | **26.0+ / 26.0+** |
| `<dialog>` | Baseline widely available since Mar 2022 | | | |
| `dialog closedby` | **71.54%** | 134+ | 141+ | **TP only / not shipped on iOS** |
| `hidden="until-found"` | 88.79% | 102+ | 148+ (139–147 partial) | 26.2+ partial |

So: the popover attribute is safe. **Anchor positioning is the weak link** — Safari only got it in
26.0, which means every iPhone more than one OS version behind has no `anchor()`. That is what the
`@oddbird/css-anchor-positioning` polyfill in QDS is for, and it is why the polyfill is a
*requirement*, not a nicety (§7). `closedby` is not usable yet on iOS at all, which decides §8's
dismiss design.

---

## 4. WAI-ARIA and expert commentary

### APG — Dialog (Modal) (`w3.org/WAI/ARIA/apg/patterns/dialog-modal/`)

Keyboard, quoted:

| Key | Behaviour |
| --- | --- |
| (on open) | "When a dialog opens, focus moves to an element inside the dialog." |
| `Tab` | "Moves focus to the next tabbable element inside the dialog. If focus is on the last tabbable element, moves focus to the first tabbable element." |
| `Shift + Tab` | the mirror |
| `Escape` | "Closes the dialog." |

Roles/states/properties, quoted:

- the container "has a role of `dialog`";
- "All elements required to operate the dialog are descendants of the element that has role
  `dialog`";
- "`aria-modal` set to `true`";
- labelled by "`aria-labelledby` property that refers to a visible dialog title" **or** `aria-label`;
- "`aria-describedby` property is set on the element with the `dialog` role" — optional.

And the caveat that decides one of our rows: mark `aria-modal` **only when both** "application code
prevents all users from interacting in any way with content outside of it" **and** "visual styling
obscures the content outside of it". `<dialog>.showModal()` sets `aria-modal="true"` for us and makes
the first half true by making the rest of the document inert; the second half is the consumer's CSS
(`::backdrop`). We should not add `aria-modal` by hand.

**There is no APG pattern for a non-modal popover.** The closest are Dialog (Modal), Disclosure and
Menu Button. A popover is a disclosure whose content is elevated — which is exactly the owner's
standing "content is one role" direction, arrived at independently.

### Expert commentary

**Adrian Roselli, *Where to Put Focus When Opening a Modal Dialog* (2025, updated April 2026)** — the
most decision-relevant post found. Concrete guidance:

| Dialog kind | Where focus goes |
| --- | --- |
| Short informational message | the close button — "lets users quickly dismiss it and get on with their day" |
| Longer or interactive message | the dialog itself, or its primary heading |
| Action-required / destructive | the **least destructive** control (Cancel, not Delete) |
| Short familiar form (login) | the first field |
| Long or unexpected form | the dialog or heading, "particularly on mobile where keyboard popups create barriers" |

Technique: `tabindex="-1"` on a heading or container to make it programmatically focusable — though
he notes native `<dialog>` can take focus without it. **The April 2026 testing note is the one to
pin:** announcing the dialog *role* on open varies by reader — only macOS VoiceOver announces it when
focus lands on the dialog itself; NVDA and JAWS announce it only when focus lands on content inside.
So "focus the dialog container" is better for orientation on VoiceOver and worse on NVDA/JAWS, and
neither choice is universally right. Our API must therefore let the consumer decide, and must not
hard-code "focus the first control".

**Adrian Roselli, *Should a Dialog Close When Clicked Outside?* (2026-08)** — three categories, no
universal answer: *action required* (do not light-dismiss; consider a standalone page instead),
*no action required* (light-dismiss is "a usability win"), *weird patterns* (drawers, sheets,
lightboxes — weigh data loss and restorability). Quote: "Context means there is rarely a universal
answer." **Consequence: `closeOnOutsideClick` must stay a prop, and its default must be argued
rather than inherited.** QDS defaults it `true`; Base UI defaults `disablePointerDismissal: false`
(i.e. also dismissible). Both match "no action required", which is the common case.

**Adrian Roselli, *Brief Note on Popovers with Dialogs* (2023)** — the layering finding, and the
strongest single argument for using both native mechanisms rather than one:

- A popover shown in front of a `<div role="dialog">` **blocks the dialog's own controls**, including
  the button needed to prevent a session timeout. Neither `auto` nor `manual` dismiss saves you.
- Native `<dialog>` layers correctly: a `manual` popover repositions *behind* the dialog, and an
  `auto` popover self-closes when a dialog opens. MDN confirms the mechanism — showing a modal
  dialog dismisses `auto` popovers.
- His recommendation: "Probably don't put any `popover` feature work on your development calendars
  until *after* the work to swap existing dialogs with `<dialog>`."

**Read that against QDS's architecture and it is a vindication, not a warning.** QDS's modal is a
real `<dialog>` and its popover is a real `popover="auto"`, so the interaction Roselli describes as
broken is the one case that already works. A library that portalled both into `<div>`s would own the
bug. **This is the single strongest evidence in the whole cluster for the platform-first stance**,
and §7 records it as such.

**Scott O'Hara, *Having an open dialog* (2019)** — the counterweight, and it must be represented
honestly. His findings: the `<dialog>` focus algorithm focuses the first focusable element and
scrolls past content the user has not read; closing does not restore focus to the invoker; `inert`
support was incomplete; `aria-modal` did not reliably contain the iOS/Android virtual cursor; and
readers behaved inconsistently (JAWS skipped content, NVDA duplicated, TalkBack missed the role).
His conclusion was to use a custom dialog instead.

Two of those five are now fixed by the platform (`inert` shipped; `autofocus` inside `<dialog>` is
honoured, so the focus algorithm is steerable) and one is not (`<dialog>` still does **not** restore
focus to the invoker — that is ours to do). The reader inconsistencies are partly re-measured by
Roselli's 2026 update. The honest summary: **the 2019 objections are mostly, not entirely,
obsolete, and the un-obsolete one is focus restoration.**

**MDN, Popover API** — the semantics we are buying:

- `auto`: light-dismissible (outside click **and** Esc), only one open at a time per stack unless
  nested, closes other `auto` popovers, dismissed by `showModal()` and `requestFullscreen()`.
- `manual`: not light-dismissible, multiple at once, no stack participation.
- `hint`: light-dismissible, closes other *hints* but **not** `auto` popovers, and an `auto` nested
  inside a `hint` is downgraded to `hint`. Explicitly "for tooltips and hover/focus popovers" — see
  `research-tooltip.md`.
- Nesting is established three ways: DOM descendant, via the invoking element, or via the `anchor`
  attribute. Closing a popover closes its descendants.
- With `popovertarget`, the browser sets **implicit `aria-details` and `aria-expanded`**, puts the
  popover next in the tab sequence, and **restores focus to the invoker on Esc**.

That last bullet is a large, free chunk of the work the tier-1 libraries hand-build.

---

## 5. GitHub patterns (grep MCP)

Searches run: `popover="auto"` (TSX), `popovertarget=` (TSX), `popover="hint"` (TSX/TS/HTML),
`onBeforeToggle` (TSX), `anchor-name:` (CSS), `.showModal()` (TSX), `interestfor=` (TSX/TS/HTML),
`safePolygon(` (TSX/TS), `role="tooltip"` (TSX). Popover/modal findings:

- **`popover="auto"` is in production and people have been bitten in a specific, repeatable way.**
  Three separate codebases document the *same* bug: showing an `auto` popover between `pointerdown`
  and `click` makes the browser's light dismiss treat the opening click as an outside click and close
  it instantly. `facebook/astryx` carries a `pointerActiveRef` to defer `.show()` past the active
  click; `microsoft/fluentui`'s Cypress suite has a regression test titled *"should stay open after
  right click (no immediate light-dismiss)"* because the trailing `pointerup`/`auxclick` from a
  right-click did exactly this. **This is a required test row for us (§9)**, and QDS's suite does not
  have it.
- **Fluent UI's `PopoverSurface` renders `<dialog popover="auto">`** so one element serves both the
  non-modal (`showPopover()`) and modal (`showModal()`) paths, switched by `trapFocus`. That is a
  real, shipped answer to §8's "two families or one" question.
- **Fluent UI also documents the *other* known gap**: with `popover="auto"`, a programmatic close
  driven by framework state can unmount the surface before any close-side effect calls
  `hidePopover()`, so focus restoration is lost. They mark those scenarios as "a known gap of the
  native `popover='auto'` model". **This is the failure mode our arm-flip-driven close will hit**
  (§7, requirement R4).
- **`popovertarget` is used bare in the wild and TypeScript hates it**: `refined-github` writes
  `// @ts-expect-error HTML standard`, Storybook writes `// @ts-expect-error popover is not yet
  supported by React`, `Starknet-Scaffold` uses `//@ts-ignore` three times. DefinitelyTyped now has
  it (`popoverTarget`, `popoverTargetAction`, and `popover="hint"` in its element-attribute tests).
  **Our JSX typing must ship `popover` and `popovertarget` on the intrinsic surface**, or every
  consumer writes `@ts-ignore` — and we already own the intrinsic contract via the typed-markup work.
- **Qwik's own type tests** (`jsx-types.unit.tsx`) assert `popovertarget`, `popover="manual"`, and
  `ToggleEvent` on `onToggle$`/`onBeforeToggle$`, and `qwik-ui`'s `popover-panel-impl.tsx` shows the
  same architecture as QDS one layer up. So this is a Qwik-ecosystem-wide stance, not a QDS
  invention.
- **`anchor-name:` in CSS is always written behind `@supports`** in every serious codebase found:
  Label Studio (`@supports (anchor-name: --test)` with a JS-set `position-anchor`), Fluent UI web
  components (`@supports (anchor-name: --anchor)` for the listbox popover with a full
  non-anchor fallback block, plus `position-try-fallbacks: flip-block, flip-inline, flip-inline
  flip-block`), Ariakit's app CSS (`@supports (anchor-name: --a)` / `@supports not (...)` pairs),
  scikit-learn, statamic, BotFramework-WebChat. **Nobody ships anchor positioning unguarded.**
  Fluent UI even excludes Safari 26.0 specifically — `@supports (anchor-name: --a) and
  (text-size-adjust: auto)` — with a comment that anchor positioning *crashes* Safari 26.0
  (webkit bug 298646) on their tablist. That is a live, named platform bug in the exact Safari
  version that first shipped the feature.
- **`.showModal()` in the wild is overwhelmingly imperative and ref-driven** (hanko, openDAW,
  vector-admin, Verba, UltraRAG, joplin). Joplin's `Dialog.tsx` carries the most useful comment
  found: the dialog element must be managed **outside** the framework's lifecycle, because
  `.close()` has to be called while the element is still attached, and cleanup can run after
  removal. **That is a direct warning about closing a `<dialog>` that lives inside an `@if` arm**
  (§7, R4).

---

## 6. Expected screen-reader behaviour

**Source:** `w3c/aria-at`, test plan `tests/apg/modal-dialog` (`data/assertions.csv`,
`data/tests.csv`), read 2026-08-22. **There is no aria-at plan for a non-modal popover** — the plan
list is `accordion, alert, banner, breadcrumb, checkbox*, combobox*, command-button, complementary,
contentinfo, disclosure-faq, disclosure-navigation, form, horizontal-slider, link-*, main, menu-*,
menubar-editor, meter, minimal-data-grid, modal-dialog, quantity-spin-button, radiogroup-*,
rating-*, seek-slider, slider-multithumb, switch*, tabs-*, toggle-button,
vertical-temperature-slider`. So popover's expected announcements below are derived from ARIA
semantics and are **not** community-vetted; modal's are.

The aria-at reference is an address form: a "Add Delivery Address" button opens a dialog with an
`<h2>` "Add Delivery Address", a "Street" input, and "Verify Address"/"Add"/"Cancel" buttons; "Add"
opens a nested "Address Added" dialog with a description paragraph, "OK" and "Close".

**Sequence A — Open a modal dialog** (`openModalDialog`)

1. keypress `Enter` on the "Add Delivery Address" button
2. → "dialog" `[p1: roleDialog]`
3. → "Add Delivery Address" `[p1: the dialog's name, from `aria-labelledby` → the `<h2>`]`
4. → "Street" `[p1: the name of the focused input]`
5. → "edit" / "text field" — "the ability to enter or edit text is conveyed" `[p1]`
6. → NVDA/JAWS: focus-mode beep `[p2: interactionModeEnabled]`

Step 3 is what `modal.title` buys. Without a title part mounted, QDS emits no `aria-labelledby` and
the reader announces an unnamed dialog — a priority-1 failure. **Our API should make an unnamed
dialog hard to ship** (§8).

**Sequence B — Close a modal dialog** (`closeModalDialog`)

1. `Enter`/`Space` on "Cancel" (or `Escape`)
2. → "button" `[p1]`
3. → "Add Delivery Address" `[p1]` — **the name of the element focus returns to.** aria-at asserts
   that after closing, the reader lands somewhere named. `<dialog>` does *not* restore focus to the
   invoker; the popover attribute *does* (on Esc). This assertion is why focus restoration is a
   requirement and not a nicety (§7, R3).

**Sequence C — Tab wrap backwards** (`navToLastFocusableElementModalDialog`)

1. `Shift+Tab` from the "Street" input (first focusable)
2. → "Cancel" `[p1]` → "button" `[p1]` — focus wrapped to the last control rather than leaving.

**Sequence D — Tab wrap forwards** (`navToFirstFocusableElementModalDialog`)

1. `Tab` from "Cancel" (last focusable)
2. → "Street" `[p1]` → "edit" `[p1]` → focus-mode beep `[p2]`

**Sequence E — Reading-cursor containment** (`bumpTopEdge` / `bumpBottomEdge`)

1. repeated reader-cursor "previous item" from the `<h2>`, or "next item" from "Cancel"
2. → the cursor **stays** on the heading / on the Cancel button `[p1: cursorAtAddDeliveryAddressHeading
   / cursorAtCancelButton, both tagged `aria-modal`]`

This is the row that `aria-modal`/`inert` exists for, and it is a **priority-1** assertion. A
hand-rolled focus trap passes C and D and fails E, because a focus trap does not contain a *reading*
cursor. `showModal()` passes E for free by making the rest of the document inert. **This is the
second-strongest platform-first argument in the cluster**, after Roselli's layering finding.

**Sequence F — Open a nested modal dialog** (`openNestedModalDialog`)

1. `Enter` on "Add"
2. → "dialog" `[p1]` → "Address Added" `[p1]` → the full description sentence `[p1, from
   `aria-describedby`]` → "button" `[p1]` → "OK" `[p1]`

The description is a priority-1 assertion **for this dialog**, because it is a message dialog. The
APG calls `aria-describedby` optional in general; aria-at requires it where the dialog's whole point
is the message. That maps to alert-dialog semantics (§8).

**Sequence G — Close a nested modal dialog** (`closeNestedModalDialog`)

1. `Enter` on "Close"
2. → "dialog" `[p1]` → "Add Delivery Address" `[p1]` → "button" `[p1]` → "Verify Address" `[p1]`

Closing the inner dialog re-announces the **outer** dialog and the control focus returns to. Nested
modals are a first-class tested case, and QDS has four nested-modal tests. Keep them.

**Sequences H — Edge containment inside a nested dialog** (`bumpTopEdgeOfNestedModal`,
`bumpBottomEdgeOfNestedModal`) — Sequence E, one level down.

**Popover (derived, not vetted).** With `popovertarget`, the browser sets implicit `aria-expanded`
and `aria-details` on the trigger. Expected:

1. `Tab` to the trigger → trigger name → "button" → "collapsed"
2. `Enter`/`Space` → "expanded", then the popover is next in the tab sequence
3. `Tab` → the first control inside the popover, announced normally — **no dialog role, no
   containment**, because a popover is not modal
4. `Escape` → focus returns to the trigger, which re-announces as "collapsed"

Note what is *absent*: no name for the popover surface itself, because it has no role. If a consumer
needs the surface named, they add `role="dialog"` + a label via `{...rest}` — and at that point they
have a non-modal dialog, which is a legitimate thing and should be documented rather than built in.

---

## 7. The overlay-primitive requirements memo

**This is the cluster's shared deliverable.** It answers: what do popover, modal, tooltip and toast
genuinely need from the framework; which of those needs are already met; and which are new.

### 7.0 Ground truth about the `overlay` mark, read first-hand

- The type and its rationale live at `packages/compiler/src/artifacts.ts:608-628`. Quoting the doc
  comment: *"An element marked for cross-platform elevation: it renders above the rest of the UI,
  escaping clipping and stacking ancestors. Elevation only — no dismissal, focus, positioning, ARIA,
  or animation policy rides on this record."*
- The record is `{ hostNodeId, componentName?, order, keyedRepeatScopeIds? }`. **There is
  deliberately no `inputs` field**, and the comment explains why: no inputs means no dependencies
  means the record can never re-run. *"Elevation must never be driven by shown-ness. `@if` owns
  whether the element exists; a reactive `overlay={isOpen}` would re-elevate the host on every
  toggle."*
- Consumers, from `grep -rln "SemanticOverlay\|graph.overlays" packages/*/src` in this worktree:
  `compiler/src/artifacts.ts` (the type), `passes/semantic-graph/types.ts` (the array),
  `passes/semantic-graph/collect-elements.ts` (collection + validation), and
  `passes/semantic-graph/arm-material.ts` (which folds `graph.overlays` into the per-arm material
  list alongside handlers and behaviors). **Nothing in `packages/web`, `packages/runtime` or
  `packages/serializer` reads it.** The mark is collected, validated, and arm-aware, and it lowers to
  nothing. That is the "overlay emitter" gap, confirmed at first hand rather than inherited from
  T002.
- `popovertarget` is *already* an IDREF attribute to the compiler
  (`passes/semantic-graph/idref-attributes.ts:21`), so `popovertarget={x.contentEl}` is expected to
  work today with a minted id. That is separate from, and complementary to, the `overlay` mark.

### 7.1 The requirements, by family

`C` = collapsible, `P` = popover, `M` = modal, `T` = tooltip, `N` = toast (notification).

| # | Requirement | C | P | M | T | N | Status today |
| --- | --- | :-: | :-: | :-: | :-: | :-: | --- |
| R1 | **Existence flips with state** — the surface appears and disappears | ✓ | ✓ | ✓ | ✓ | ✓ | **Met.** Attribute flips and `@if` arms both work, including in projected parts and across SSR resume (T043 U-K, T045 U-F, T051 U-H, T044 U-L, all merged) |
| R2 | **Elevation** — escape clipping and stacking ancestors | — | ✓ | ✓ | ✓ | ✓ | **Met on the web by the platform**, not by us: `popover` attribute (P, T, N) and `<dialog>.showModal()` (M). **Not met as a framework fact:** the `overlay` mark has no emitter, so nothing is portable to non-web targets |
| R3 | **Focus restoration to the invoker on close** | — | ✓ | ✓ | — | — | **Partly met by the platform.** `popovertarget` restores focus on Esc; `<dialog>` does **not** restore at all. Ours to do for M, and for P when closed any way other than Esc |
| R4 | **Close before unmount** — the surface must leave the top layer *while it is still attached* | — | ✓ | ✓ | ✓ | ✓ | **NOT MET, and this is the sharpest new risk.** See 7.2 |
| R5 | **Light dismiss** — outside click and Esc close the surface | — | ✓ | ~ | ✓ | — | **Met by the platform** for P/T (`popover="auto"`/`"hint"`); M gets Esc free from `<dialog>` and needs the pointerdown/pointerup backdrop guard hand-written (QDS already has it) |
| R6 | **Layering between kinds** — a popover must not occlude a dialog | — | ✓ | ✓ | ✓ | ✓ | **Met by the platform, and *only* by the platform** (Roselli 2023, §4). A portal-based implementation owns this bug; a native one does not |
| R7 | **Inertness of the rest of the page + reading-cursor containment** | — | — | ✓ | — | — | **Met by `showModal()`.** Priority-1 in aria-at (§6 Sequence E) and unreachable with a hand-rolled focus trap |
| R8 | **Anchored positioning** to the trigger | — | ✓ | — | ✓ | ~ | **Met by CSS anchor positioning**, at 84% global and Safari-26-only, so **the polyfill is a hard requirement, not an option** (§3). N only needs it for the anchored-toast variant Base UI ships; skip that |
| R9 | **A minted id crossing from trigger to surface** (`popovertarget`, `aria-controls`, `aria-labelledby`, `aria-describedby`) | ✓ | ✓ | ✓ | ✓ | — | **Met.** `element()` handles in IDREF positions, one handle per position, read by a part inside the root. `popovertarget` is already IDREF-aware in the compiler |
| R10 | **A callback on the state change** (`onChange(open)`) | ✓ | ✓ | ✓ | ✓ | ✓ | **Met.** Instance callbacks landed (T046 round 3) |
| R11 | **Seeds from parts other than the root** (a mounted `modal.title` telling the content it has a label) | ✓ | ✓ | ✓ | ✓ | ✓ | **Met** (T051 U-H). **With one hole: parts inside `@if` arms are not pre-seeded** — the arm choice is render-time and the renderer renders arms with empty context, dropping `sharedSeeds`. A `@if`-armed `modal.description` therefore would not register itself |
| R12 | **Consumer handler composition and `{...rest}` forwarding of function props / `el` handles** | ✓ | ✓ | ✓ | ✓ | ✓ | **Met** (T047 U-O + T049b, link-time record emission, byte-neutral) |
| R13 | **Timers and delays** (hover open/close delay, toast auto-dismiss) | — | ~ | — | ✓ | ✓ | **Unproven.** `setTimeout` in a handler is plain JS and should work, but nothing in the shipped families uses one, and nothing proves a pending timer survives — or is correctly abandoned across — an SSR resume or an unmount. See `research-tooltip.md` §8 and `research-toast.md` §8 |
| R14 | **A list that grows at runtime** (the toast queue) | — | — | — | — | ✓ | **Unproven and blocking for toast.** Needs `@for` over a `state` array *containing widget parts*, and widget-part-inside-`@for` has no fixture anywhere in `packages/vitest-browser/browser/fixtures/`. Same gap `research-tabs.md` §6b(5) names |
| R15 | **A live region that pre-exists its content** | — | — | — | — | ✓ | **Met by ordinary rendering**, but only if the family's shape forces the region to be rendered before the first message. That is an API-shape obligation, not a framework gap (`research-toast.md` §7) |

### 7.2 R4, the sharpest new risk, stated precisely

An element in the top layer must be told to leave it (`hidePopover()`, `dialog.close()`) **while it
is still in the document**. Remove it first and the browser is left holding a top-layer entry for a
detached node: focus is not restored, the `::backdrop` may persist, and the `auto`-popover stack is
corrupted so the *next* popover light-dismisses wrongly.

Three independent sources say this is real:

- Joplin's `Dialog.tsx`: the dialog is managed with native APIs specifically because "cleanup can
  happen after an element is removed from the HTML DOM", and `.close()` "needs to happen even if the
  dialog is closed by removing its parent from the React DOM".
- Fluent UI's headless popover Cypress suite marks "programmatic close: when React state flips
  `open: true → false`, the surface unmounts before any close-side effect can call `hidePopover()`"
  as a **known gap** of the native popover model.
- MDN: showing a modal dialog dismisses `auto` popovers — i.e. the browser maintains cross-element
  stack state that a detached node cannot participate in.

**Why this bites us specifically.** Our idiomatic way to make a surface disappear is an `@if` arm.
An arm flip removes the node. There is no "before the arm closes" hook, and the standing doctrine is
that we add no new authoring APIs to create one. So the two survivable shapes are:

- **(a) Never unmount.** The surface is always in the tree; `popover`/`hidden` and
  `showPopover()`/`hidePopover()` decide visibility. This is exactly what QDS does for both families
  — neither popover nor modal uses conditional rendering — and it is why QDS never hit this. It costs
  a permanently-rendered subtree.
- **(b) Drive the platform call from the same state write that flips the arm**, ordered so the hide
  lands first. That is a framework ordering guarantee we do not have and cannot state.

**Recommendation: (a), and say so loudly in the docs.** "A popover's content is always in the page;
the browser decides whether it is showing" is a one-sentence rule that also happens to be what makes
`hidden="until-found"`, view transitions and exit animations possible. But it is a *design
constraint the framework imposes*, not a free choice, and the PM should see it as such.

### 7.3 What is genuinely new: the overlay emitter, scoped

The `overlay` mark's contract (7.0) is deliberately narrow — **elevation only**. Against the R-table
that means an emitter would satisfy exactly **R2**, and nothing else. R3–R8 are not elevation and the
record explicitly disclaims them.

So the emitter's job on the web is small and precisely bounded:

1. For each `SemanticOverlay` host, emit the platform's elevation mechanism. On the web there are two
   and the record does not distinguish them, which is the design question: does `overlay` mean
   "`popover=manual`" (elevation with no dismiss policy, matching the record's disclaimer exactly),
   or is the mechanism chosen per family by the author writing `popover="auto"` themselves and
   `overlay` staying a *portability* annotation for non-web targets?
2. Nothing else. No dismiss, no focus, no ARIA, no positioning — all four are named in the doc
   comment as not riding on this record.

**The honest reading is that the web does not need the emitter at all**: `popover="auto"` and
`<dialog>` are attributes and elements our families can write directly today, and `popovertarget` is
already IDREF-aware. The emitter's value is **cross-target portability** — it is the record a React
or Vue lowering would turn into a portal/teleport, and the record a native target would turn into
whatever elevation means there. That reframes it: *the overlay emitter is not a tranche-4 blocker on
the web; it is the thing that stops tranche 4 from being web-only.*

That is a material change to the recorded tranche-4 entry gate ("U-F fixed **+ the overlay elevation
runtime emitter**", T006 §5). U-F is fixed. The emitter is, on the evidence above, **not needed to
ship these families on the web** — and stamping the mark anyway (the T003 memo's recommendation:
inert today, correct the day it lands) costs nothing and remains right. **This is a PM/owner call,
not a worker's, and it is §10 question 1.**

### 7.4 What the platform-first stance costs, itemised

Recorded so the decision is made with both columns visible. Each row is a lever the six
portal-based libraries have and we would not:

| Lever we give up | Who has it | What breaks without it | Mitigation |
| --- | --- | --- | --- |
| Arbitrary placement/collision config (`side`, `align`, `sideOffset`, `collisionBoundary`) | Base UI, Ark, Radix, Kobalte, Bits, React Aria | nothing, if the consumer writes CSS. `position-try-fallbacks` covers flip/shift | owner has already ruled: no `placement` prop, positioning is CSS |
| A real `Arrow` part with computed position | all six | consumers hand-draw arrows | CSS `anchor()` can position a pseudo-element; document a recipe |
| `modal` as a *popover* mode (`modal: true \| 'trap-focus'`) | Base UI, Ark, Radix | a focus-trapping popover needs the modal family instead | Fluent UI's `<dialog popover="auto">` unification would give it back (§10 q3) |
| Escape-hatch parts (`Portal`, `Positioner`, `Backdrop`, `Viewport`) | all six | consumers cannot intervene between root and surface | ours is `{...rest}` plus CSS; genuinely less powerful |
| Behaviour on browsers without anchor positioning | all six (JS positioning works everywhere) | **on Safari < 26 the popover renders unpositioned** | the `@oddbird` polyfill is therefore mandatory, and its cost is a real dependency decision |
| A workaround for Safari 26.0's anchor-positioning crash | all six | Fluent UI documents a crash (webkit 298646) needing `@supports (anchor-name: --a) and (text-size-adjust: auto)` | our CSS must carry the same guard; **this is a known landmine, not a hypothetical** |

### 7.5 The one-paragraph version

Popover, tooltip and toast need **elevation, light dismiss, layering and anchored positioning**;
modal additionally needs **inertness and reading-cursor containment**; all five need **existence
flips, seeds, callbacks and minted ids**, and those four are already landed. On the web the platform
supplies elevation, dismiss, layering and containment better than we could, and Roselli's
popover-over-dialog finding plus aria-at's priority-1 cursor-containment assertions mean a
portal-based implementation would be *worse*, not merely different. What the platform does not
supply is **focus restoration on non-Esc closes**, **a "hide before unmount" ordering guarantee**
(R4 — mitigated by never unmounting), **timers that survive resume** (R13), and **a runtime-growing
list of widget instances** (R14, which blocks toast specifically). The `overlay` mark's emitter would
satisfy elevation *portably*; it is not needed for the web families to work, and treating it as a
hard tranche-4 gate is worth re-examining.

---

## 8. Markless API design

### 8a. `popover`

Parts: `popover.root`, `popover.trigger`, `popover.content` — the QDS folder listing exactly.

```ts
import type { PropsOf, Seeded } from '@markless/core';

export type PopoverRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** Whether the surface is showing. Omit it and the popover starts closed. */
	readonly open?: boolean;
	/** Called with the new value when the popover opens or closes — including
	 *  when the browser closes it because a person clicked away or pressed Escape. */
	readonly onChange?: (open: boolean) => void;
	/** Pointing at the trigger opens the popover. Omit it and only a click does. */
	readonly hover?: boolean;
	/** How long a pointer rests on the trigger before it opens, in milliseconds. */
	readonly delay?: number;
	/** How long the popover waits after the pointer leaves before it closes. */
	readonly closeDelay?: number;
};

export type PopoverTriggerProps = PropsOf<'button'>;
export type PopoverContentProps = PropsOf<'div'>;

export type PopoverInstanceState = Seeded<
	PopoverRootProps, 'open' | 'hover' | 'delay' | 'closeDelay'
> & { onChange?: PopoverRootProps['onChange'] };
```

```tsx
export const popoverState = shared(
	() => {
		const popover: PopoverInstanceState = state({
			open: false, hover: false, delay: 200, closeDelay: 0,
		});
		const contentEl = element<HTMLDivElement>();

		return {
			...popover,
			contentEl,
			onChange: undefined as ((open: boolean) => void) | undefined,
			// The browser is the source of truth: this runs from the content's
			// toggle event, whoever caused it (click, Escape, outside click,
			// another auto popover opening, a modal opening).
			settle(open: boolean) {
				if (popover.open === open) return;
				popover.open = open;
				popover.onChange?.(open);
			},
		};
	},
	{ scope: 'widget' },
);

export function PopoverTrigger({ children, ...rest }: PopoverTriggerProps) @{
	const popover = popoverState();

	// No onClick at all: popovertarget is the platform's own toggle, and it
	// also gives us implicit aria-expanded, tab-order placement, and focus
	// restore on Escape for free.
	<button {...rest} type="button" popovertarget={popover.contentEl}>{children}</button>
}

export function PopoverContent({ children, onToggle, ...rest }: PopoverContentProps) @{
	const popover = popoverState();

	<div
		{...rest}
		el={popover.contentEl}
		popover="auto"
		overlay
		ui-open={popover.open}
		ui-closed={!popover.open}
		onToggle={(event) => {
			popover.settle(event.newState === 'open');
			onToggle?.(event);
		}}
	>{children}</div>
}
```

Design notes:

- **The trigger has no click handler.** `popovertarget` is the whole mechanism. This is a smaller,
  more correct implementation than QDS's (which keeps `popovertarget` *and* a click handler that
  only records `openReason`), and it inherits implicit `aria-expanded`/`aria-details`, tab-order
  placement, and Esc focus restore.
- **`overlay` is stamped and is inert today.** Literal-only, per the grammar
  (`overlay={isOpen}` is a diagnosed error). The parity table must say in one line that it currently
  does nothing and that elevation comes from `popover="auto"`.
- **The content is never unmounted** (R4). No `@if` around it.
- **`ui-open` reflects state that the browser can change without us.** The `onToggle` write is what
  keeps them in step; that is the whole reason the toggle handler exists.
- **`element()` in a `popovertarget` position** — already IDREF-aware in the compiler. The read is
  from the *trigger* part, not the root, so `MARKLESS_ELEMENT_HANDLE_IDREF_WIDGET_ROOT` does not
  fire.
- **Anchor CSS ships with the package**, selecting on the parts rather than on deleted `ui-qds-*`
  attributes. Two workable selectors: the `ui-open`/`ui-closed` pair (present on every part, so
  unambiguous) or a documented class contract. Either way it must be wrapped in
  `@supports (anchor-name: --a) and (text-size-adjust: auto)` — the Safari-26.0 crash guard from §5 —
  with a non-anchor fallback block, and the `@oddbird` polyfill loaded conditionally exactly as QDS
  does it.
- **Open on load.** A popover born `open` needs `showPopover()` after the element exists. QDS solves
  it with an apologised `useVisibleTask$`. We do not have that and should not invent it — §10
  question 5.

### 8b. `modal`

Parts: `modal.root`, `modal.trigger`, `modal.content`, `modal.title`, `modal.description`,
`modal.close` — the QDS folder listing exactly. **Keep the name `modal`** despite every tier-1
library saying `dialog`: it is the QDS name, `dialog` is the HTML element our content part *is* (so
`modal.content` rendering a `<dialog>` reads correctly and `dialog.content` rendering a `<dialog>`
reads like a tautology), and the naming ruling says match QDS unless there is a reason.

```ts
export type ModalRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	readonly open?: boolean;
	readonly onChange?: (open: boolean) => void;
	/** Pressing the page behind the dialog closes it. Omit it and pressing behind closes it. */
	readonly closeOnOutsideClick?: boolean;
	/** The dialog interrupts to demand a decision, so a reader treats it as urgent
	 *  and reads the description with it. */
	readonly urgent?: boolean;
};
```

- `modal.content` renders `<dialog>` with `el={modal.contentEl}`,
  `aria-labelledby={modal.titleEl}` and `aria-describedby={modal.descriptionEl}` — each a single
  `element()` handle in an IDREF position, read from a part inside the root. Legal today.
- **`urgent` is the alert-dialog switch**, spelled in plain language rather than as
  `role="alertdialog"`. It sets `role="alertdialog"`, and per the APG it makes the description
  required rather than optional. QDS never implemented alert dialogs; this is one prop, and it is
  §10 question 4.
- **Do not set `aria-modal` by hand** — `showModal()` sets it, and the APG's two-condition caveat
  (§4) means setting it while the page is *not* inert is a lie.
- **Labelling should be hard to get wrong.** QDS silently omits `aria-labelledby` when no title part
  mounted; §6 Sequence A makes that a priority-1 failure. Options: (a) copy QDS (silent), (b) a
  dev-only diagnostic when a modal opens with neither `modal.title` nor an `aria-label` on the
  content — recommended, and cheap, since the title part's seed already tells us
  (R11); (c) require the title part structurally, which violates the "every piece of markup is free"
  principle. **Note the R11 hole:** a `modal.title` inside an `@if` arm is not pre-seeded, so
  detection (b) would false-positive on a conditionally-titled dialog. Worth knowing before building
  it.
- **Backdrop dismiss** is the QDS `pointerdown`+`pointerup` guard, ported verbatim along with its
  two guard tests. **Do not use `closedby="any"`**: 71.5% global, Safari TP only, **not shipped on
  iOS at all** (§3).
- **Focus restoration is ours.** `<dialog>` does not do it, aria-at Sequence B asserts it. The
  trigger's `element()` handle plus a `.focus()` in the close path is the shape; whether a `.focus()`
  call belongs in a handler or is a behavior is §10 question 6.
- **Initial focus is the consumer's**, via native `autofocus` inside the dialog. That matches
  Roselli's five-case table (§4) — no library-chosen default can be right for all five — and it costs
  us no API.
- **Scroll lock**: QDS uses `@fluejs/noscroll`. `showModal()` does not lock page scroll. Either take
  the dependency, or ship `body { overflow: hidden }`-on-`:has(dialog[open])` CSS and accept the iOS
  rubber-band caveat. §10 question 7.

### What is not expressible today

| Wanted | Blocked by |
| --- | --- |
| Closing the surface with an `@if` arm | R4: no hide-before-unmount ordering. Never unmount instead |
| `aria-describedby` pointing at two elements | `MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE` (U-C, unchartered) |
| A `modal.title` inside an `@if` arm registering itself | R11's arm-seed hole |
| Elevation on a non-web target | the `overlay` emitter (7.3) |
| `showPopover()` at mount for a born-open popover | no post-render hook, and none should be invented (§10 q5) |

---

## 9. Test plan

`packages/headless/components/src/popover/popover.browser.ts` and
`.../modal/modal.browser.ts`, scenarios beside each. Part-role testids: `root`, `trigger`,
`content`, plus `title`, `description`, `close` for modal.

Popover scenarios: `popover-basic.tsrx`, `profile-card.tsrx` (realistic: a trigger, a card with two
links and a close button), `starts-open.tsrx`, `hover.tsrx`, `two-popovers.tsrx`,
`popover-in-modal.tsrx` (the Roselli layering case).

Modal scenarios: `modal-basic.tsrx`, `delivery-address.tsrx` (the aria-at shape: heading, input,
three buttons — the one a transcript test should point at), `no-title.tsrx`, `urgent.tsrx`,
`nested.tsrx`, `no-outside-close.tsrx`.

Rows that must exist, with why:

| Row | Why |
| --- | --- |
| trigger has `popovertarget` equal to the content's minted `id`; both non-empty | the IDREF contract |
| content has `popover="auto"` | the elevation mechanism, asserted rather than assumed |
| **opening on `pointerdown` does not immediately light-dismiss**; **right-click on the trigger does not immediately close it** | §5: three codebases hit exactly this; QDS's suite has neither row |
| Escape closes and **focus is back on the trigger** | the platform's free focus restore, which we must not break |
| clicking outside closes, and `onChange(false)` fires | the browser-closes-it path is the one a hand-rolled implementation forgets |
| opening a second popover closes the first | the `auto` stack; QDS tests the hover version of this only |
| a popover open inside an open modal: **opening the modal closes the popover, and the popover never covers the dialog's controls** | Roselli 2023 (§4). This is the row that justifies the whole architecture |
| modal: `aria-labelledby` present with a title part, **absent** without one | QDS has both; keep both |
| modal: `aria-modal="true"` after `showModal()`, and we never set it ourselves | the APG caveat |
| modal: focus wraps on Tab and Shift+Tab | aria-at C/D |
| modal: pointer-down inside → pointer-up outside does **not** close; keyboard-synthesised pointer events do **not** close | QDS's two guard tests, ported verbatim |
| modal: nested — Escape closes only the top one; the inner close re-announces the outer | aria-at G, QDS has the Escape half |
| modal: page scroll locked while open, restored on close, and **still locked** while a nested modal closes | QDS's three scroll rows |
| modal: focus returns to the trigger on close | aria-at B; **`<dialog>` does not do this**, so this row is red until we implement it |
| both: `{...rest}` cannot overwrite `popover`, `popovertarget`, `aria-labelledby` | the spread-first convention |
| both: SSR + resume — served HTML has the surface present and closed; the first click after resume opens it | tranche 4's entry gate |
| both: two co-rendered widgets mint distinct ids and do not cross-open | instance isolation |

**Not tested, and why:** anchor positioning itself (a CSS feature, and the vitest browser lane is one
Chromium — the Safari 26.0 crash and the `< 26` polyfill path are unreachable there). The parity
table must say the polyfill path is unexercised and that it is a manual/matrix check. The `@oddbird`
polyfill's own behaviour is likewise out of our test scope.

---

## 10. Open questions

1. **Is the overlay emitter still a tranche-4 entry gate?** T006 §5 recorded "U-F fixed + the overlay
   elevation runtime emitter" as the gate. U-F is fixed (T045, merged). §7.3 argues the emitter buys
   **cross-target portability, not web correctness**, so the web families can ship without it while
   still stamping the inert mark. Recommended: land the families, keep the mark, charter the emitter
   separately against a native/React target rather than against tranche 4. **Owner call.**
2. **Does `overlay` mean a mechanism or an annotation?** If an emitter is written, `SemanticOverlay`
   carries no mechanism discriminator, and the web has two (`popover` and `<dialog>`). Either the
   emitter picks one (likely `popover="manual"`, which matches the record's "elevation only, no
   dismissal policy" disclaimer exactly) or the mark stays a portability annotation and the family
   keeps writing the mechanism. Needs a ruling before anyone writes the emitter.
3. **One family or two?** Fluent UI's headless preview renders `<dialog popover="auto">` and switches
   between `showPopover()` and `showModal()` on one `trapFocus` prop — collapsing popover and modal
   into one surface. That is a real shipped design, it would restore the `modal`-as-a-popover-mode
   lever we otherwise lose (§7.4), and it would halve the tranche. It also breaks QDS parity
   structurally. Recommended: **two families for v1** (QDS parity, and the two have genuinely
   different part inventories), with this recorded as a post-migration consolidation to evaluate.
4. **Alert dialogs.** Recommended: one root prop, `urgent`, setting `role="alertdialog"` and making
   the description effectively required. QDS never shipped it; the APG treats it as a distinct
   pattern. Confirm the name — `urgent` is plain language, `alert` collides with the toast family's
   vocabulary, and `role="alertdialog"` as a prop value would be compiler-marker-shaped.
5. **A born-open popover needs `showPopover()` after mount.** QDS uses an apologised
   `useVisibleTask$`. We have no post-render hook and adding one is out of bounds. Options: (a) do
   not support `open` on first render (document it — a popover that is open before any gesture is
   arguably wrong anyway); (b) render the content with the `popover` attribute *absent* when born
   open, so it is a plain in-flow element until the first toggle (behaviourally different, and it
   loses elevation); (c) an `attach` behavior on the content that calls `showPopover()` when the
   seed says open. (c) is the only one that both works and stays inside the existing vocabulary, and
   it should be priced before the implementation unit.
6. **Focus restoration on modal close** — `.focus()` on the trigger's handle. Is that a plain call in
   the close handler, or does it belong in an `attach` behavior? The handler is simpler; whether a
   handler may call `.focus()` on another part's `element()` handle after a state write in the same
   turn is unproven, and the U-M "lands a tick late" defect class is adjacent. Price it.
7. **Scroll lock dependency.** QDS takes `@fluejs/noscroll` plus its touch handler. Options: take the
   same dependency, ship CSS (`:has(dialog[open])`), or ship nothing and document it. Recommended:
   CSS first, and only take the dependency if the iOS rubber-band case is judged blocking. It is a
   dependency decision, so it is the owner's.
8. **The anchor-positioning polyfill is a real dependency** (`@oddbird/css-anchor-positioning`), and
   at 84% global with Safari-26-only support it is not optional. Same question shape as 7.
9. **Naming collision in the docs.** Our `popover` family renders the HTML `popover` attribute, and
   `popover.content` also accepts `popover` through `{...rest}`. Docs must be explicit, and the type
   surface should probably not let a consumer override it.
10. **`popovertarget` on our intrinsic JSX surface.** §5 shows the whole ecosystem writing
    `@ts-ignore` for it. We own our intrinsic contract (the typed-markup work), so this is free to
    get right — but it must be checked, not assumed.
