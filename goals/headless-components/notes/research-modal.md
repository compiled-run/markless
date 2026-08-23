# Modal — component research for `@markless/ui`

**Research date:** 2026-08-23
**Method:** `.ruler/skills/markless-component-research/SKILL.md`
**Branch read for Markless facts:** `feat/headless-ui-pilot` @ `fc66d3f9`
**QDS reference read:** `~/dev/open-source/qwik-design-system/libs/components/src/modal/` (READ-ONLY)

> **Gating fact, stated first.** Modal is part of the overlay cluster, and the cluster's shared
> deliverable is **§7 of `research-popover.md`** (the overlay-primitive requirements memo). That memo
> is not repeated here. It answers what popover, modal, tooltip and toast need from the framework,
> which needs are met, and what the platform-first stance costs; its §7.3 question — what the
> `overlay` mark's emitter means, and whether it is a tranche-4 gate at all — **is still open with
> the owner**. Modal implementation is gated on that ruling. This note builds on the memo: §6 below
> takes its R-table and narrows it to the rows that are modal's alone.

---

## 1. Name and alternates

Searched under: modal, dialog, modal dialog, alert dialog, lightbox, overlay, drawer, sheet,
popup, confirm dialog.

- **Dialog** is the name in Base UI, Radix, Ark, Kobalte, Bits, React Aria and Headless UI.
  **Modal** is QDS's. Same family — the SKILL's own worked example again ("Dialog → Modal").
- **Alert dialog** is a *variant*, not a family: `role="alertdialog"`, otherwise identical, used
  when the dialog interrupts to confirm something destructive. Radix, Base UI and Kobalte ship it
  as a separate component; the APG treats it as a variant of the dialog pattern. **Recommendation:
  a prop, not a family** (§9 question 2).
- **Drawer / sheet** is a modal with a different transition and edge anchoring.
  `facebook/astryx`'s `Drawer.tsx` (§5) is explicit that it is the same native `<dialog>`, with
  `showModal()` when it has a scrim and `show()` when it does not. **Same family, a CSS concern.**
- **Lightbox** is a modal containing media. Same family.
- **Non-modal dialog** — `<dialog>.show()` rather than `showModal()` — is a genuinely different
  thing: no top layer inertness, no focus containment, page stays interactive. Base UI exposes it as
  `modal={false}`. §9 question 3.
- **Alternative-named implementations:** nothing under an alternate name has a pattern the tier-1
  set lacks. The most interesting non-library implementation is the one the grep sample keeps
  showing: people driving the native `<dialog>` element directly (§5).

---

## 2. QDS reference (naming truth)

Folder listing — this *is* the part inventory:

```
modal-root.tsx      modal-content.tsx     modal-title.tsx
modal-description.tsx  modal-close.tsx    modal-trigger.tsx
index.ts   modal.css   modal.browser.tsx   research.mdx
```

`index.ts`:

```ts
export { ModalRoot        as root }        from "./modal-root";
export { ModalContent     as content }     from "./modal-content";
export { ModalTitle       as title }       from "./modal-title";
export { ModalDescription as description } from "./modal-description";
export { ModalClose       as close }       from "./modal-close";
export { ModalTrigger     as trigger }     from "./modal-trigger";
```

**Six parts.** The smallest family in this tranche, and by some distance the one with the most
behaviour per part — because the platform is doing most of the work.

### What QDS actually implements

| Concern | QDS behaviour (from the code) |
| --- | --- |
| Root | a `<div>` with `ui-open` / `ui-closed`; provides `ModalContext = { contentRef, isOpen, closeOnOutsideClick, level, isTitle, isDescription, localId }` |
| Root props | `closeOnOutsideClick` (`true`), `bind:open` |
| **Nesting** | `level = (parentContext?.level ?? 0) + 1`, read from an enclosing modal's context. Real, and tested |
| Open / close | a task that calls `contentRef.showModal()` or `contentRef.close()` on the **native `<dialog>`** |
| Scroll lock | `@fluejs/noscroll` — `markScrollable`, `createNoScroll`, `disablePageScroll` / `enablePageScroll`, with a touch handler; released on cleanup **only at level 1** |
| Content | a real `<dialog>` carrying `aria-labelledby` **only when a title mounted** and `aria-describedby` **only when a description mounted** |
| Backdrop dismissal | a two-phase pointer guard: `pointerdown` records whether the press started outside the dialog's `getBoundingClientRect()`, `pointerup` closes only if it started *and* ended outside |
| Native close | `onClose$` on the `<dialog>` writes `isOpen = false`, so Escape and any browser-initiated close are mirrored back into state |
| Trigger | a `<button aria-haspopup="dialog">` that toggles `isOpen` |
| Close | a `<button type="button">` that writes `isOpen = false` |
| Title / description | mint `${localId}-title` / `-description`, and set `isTitle` / `isDescription` in a `useConstant` so the content knows whether to emit the IDREF |

`modal.browser.tsx` carries 27 tests, including four on nesting and scroll-lock interaction and two
on focus.

### What QDS gets right, and this is the important half

Three decisions here are better than most of the library field, and they should be copied
deliberately rather than re-derived:

1. **The content is a real `<dialog>` driven by `showModal()`.** That single call buys the top
   layer, `::backdrop`, focus containment, `inert`ness of the rest of the page, Escape, and — the
   one no hand-rolled implementation can reach — **reading-cursor containment**, so a screen
   reader's virtual cursor cannot wander out of the dialog. `research-popover.md` §7.1 records that
   as **R7, met by `showModal()`** and "unreachable with a hand-rolled focus trap".
2. **`aria-labelledby` and `aria-describedby` are emitted only when the naming part actually
   mounted.** No dangling IDREF. This is the defect radio group has
   (`research-radio-group.md` §2.1), select's trigger has (`research-select.md` §2.2) and tree's
   trigger has (`research-tree.md` §2.5) — and modal is the one QDS family that gets it right.
   **Copy this mechanism**; it is `research-popover.md` §7.1's R11 (seeds from parts other than the
   root, landed as T051 U-H) doing exactly the job it was built for.
3. **The two-phase backdrop guard.** Closing on a bare `click` outside means a text selection that
   starts inside the dialog and ends on the backdrop closes it — a real and infuriating bug.
   `pointerdown`-and-`pointerup`-both-outside is the correct algorithm, and QDS has a test for the
   drag case (`"modal does not close when drag happens in different locations"`) and for the
   keyboard case (`"modal does not close when keyboard-triggered pointer events occur"`, where a
   synthetic pointer event has zero coordinates and would otherwise read as a backdrop click).

### Things to fix rather than copy

1. **No focus restoration on close.** `<dialog>` does not restore focus to the invoker, and QDS adds
   nothing. `research-popover.md` §7.1 records this as **R3, "the platform does *not* restore at
   all. Ours to do"**. The APG requires it: *"When a dialog closes, focus returns to the element
   that invoked the dialog"*. QDS's suite has `"focus goes to first focusable element when modal
   opens"` and `"focus traps within modal elements"` — and **no** test for focus returning on close.
   This is the family's clearest missing behaviour.
2. **The trigger carries `aria-haspopup="dialog"` and no `aria-expanded`.** Reasonable — a dialog is
   not a disclosure — but note Base UI, Radix and Kobalte all also omit `aria-expanded` here, so
   this is consensus, not a defect. Recorded so nobody "fixes" it.
3. **`aria-modal` is never written.** With a real `<dialog>` opened by `showModal()`, the browser
   supplies modal semantics natively and `aria-modal="true"` is redundant — arguably harmful, since
   the ARIA spec discourages doubling native semantics. But the **APG lists `aria-modal="true"` as a
   requirement** and **aria-at's modal-dialog assertions carry `refIds: aria-modal` on the four
   reading-cursor assertions** (§4b). So this is a genuine tension between the APG's div-based
   reference implementation and the native element. §9 question 1.
4. **Scroll lock is a third-party dependency** (`@fluejs/noscroll`, plus a touch handler). Modern
   `<dialog>` + `showModal()` already prevents scrolling of the page behind in every current engine;
   the library exists for older iOS Safari behaviour. **Recommendation: no dependency**, and if a
   scroll-lock is wanted it is `overflow: hidden` on `:has(dialog[open])` in CSS, which costs
   nothing and is the consumer's to opt into.
5. **`level` is threaded but barely used.** It gates the scroll-lock release (`if (level > 1)
   return`). Nesting otherwise works because the browser's top layer already stacks dialogs
   chronologically and Escape already closes only the topmost — which QDS's own test
   `"escape key closes only the top modal in nested setup"` is really testing the *browser* for.
   With the scroll-lock dependency gone, `level` may not be needed at all.
6. **No `role="alertdialog"` variant.** §9 question 2.
7. **`modal.close` writes `isOpen = false` directly rather than calling `dialog.close()`.** The task
   then calls `.close()` on the next tick. That ordering works in Qwik, but it is precisely the
   shape `research-popover.md` §7.2 warns about (**R4**: the element must leave the top layer *while
   still attached*). Ours must call the platform method, not only flip state.

---

## 3. Headless library survey

| Library | Parts | Element | Focus |
| --- | --- | --- | --- |
| **Base UI** | `Root, Trigger, Portal, Backdrop, Viewport, Popup, Title, Description, Close` | **`<div role="dialog">` in a portal** — not `<dialog>` | `initialFocus` / `finalFocus` props; trap when `modal` is `true` or `'trap-focus'` |
| **Radix** | `Root, Trigger, Portal, Overlay, Content, Title, Description, Close` | `<div role="dialog">` in a portal | `onOpenAutoFocus` / `onCloseAutoFocus` |
| **Ark UI** | `Root, Trigger, Backdrop, Positioner, Content, Title, Description, CloseTrigger` | `<div role="dialog">` in a portal | Zag focus trap |
| **React Aria** | `DialogTrigger, Modal, Dialog, Heading` | `<div role="dialog">` in a portal | `useDialog` + `FocusScope` |
| **Kobalte** | `Root, Trigger, Portal, Overlay, Content, Title, Description, CloseButton` | `<div role="dialog">` in a portal | trap |
| **Bits UI** | `Root, Trigger, Portal, Overlay, Content, Title, Description, Close` | `<div role="dialog">` in a portal | trap |
| **Headless UI** | `Dialog, DialogPanel, DialogTitle, DialogDescription, DialogBackdrop` | `<div role="dialog">` in a portal | trap |
| **QDS** | 6 parts (§2) | **real `<dialog>` + `showModal()`** | **native** |
| **Fluent UI headless preview** | — | **`<dialog popover="auto">`** — one element for both modes | native + own trap |

**Seven of eight libraries build a div-in-a-portal with a hand-rolled focus trap. QDS uses the
platform element.** This is the same 6-or-7-to-1 split select and popover showed, and it has the
same explanation: React has no top-layer story of its own, so every React library ships a `Portal`
part.

The consequences are not cosmetic. `research-popover.md` §7.1 recorded two of them as decisive:

- **R6 — layering between kinds.** A popover must not occlude a dialog. Met *only* by the platform
  (the memo cites Roselli 2023). A portal-based implementation owns that bug; a native one does not.
- **R7 — inertness plus reading-cursor containment.** Priority-1 in aria-at (§4b) and, in the
  memo's words, "unreachable with a hand-rolled focus trap".

Where the portal libraries are genuinely ahead: **focus control**. Base UI's `initialFocus` and
`finalFocus` props on the popup are a real capability — the APG names four distinct situations that
want different initial focus (complex content, large content, destructive actions, informational
dialogs; §4a). The native `<dialog>` gives us "first tabbable, or the popup itself", and the
consumer can override it with `autofocus` on the element they want. **That is the platform's own
answer and it is adequate**, but it is a prop we do not ship and they do; recorded honestly.

`facebook/astryx`'s `MobileNav.tsx` states the native case in its own words (§5), and Fluent UI's
`<dialog popover="auto">` unification is the most interesting third route: one element that can be
shown non-modally (`showPopover()`) or modally (`showModal()`), which is what
`research-popover.md` §7.4 flagged as the thing that would give back "modal as a popover mode".

---

## 4. WAI-ARIA, aria-at, and expected screen-reader behaviour

### 4a. The APG modal dialog pattern

Read `w3.org/WAI/ARIA/apg/patterns/dialog-modal/`, 2026-08-23.

**Roles and attributes:**

- the container has `role="dialog"`;
- the container has `aria-modal="true"`;
- **everything needed to operate the dialog is a descendant of the dialog element**;
- named by `aria-labelledby` pointing at a visible title, **or** `aria-label`;
- optionally `aria-describedby` pointing at the text describing its purpose.

**Keyboard:**

| Key | Behaviour |
| --- | --- |
| `Tab` | next tabbable element; **cycles to the first when on the last** |
| `Shift+Tab` | previous tabbable; cycles to the last when on the first |
| `Escape` | closes the dialog |

*"`Tab` and `Shift+Tab` do not move focus outside the dialog."* The pattern also asks for a visible
close button in the tab sequence of every dialog.

**Initial focus — four named situations**, and this is the part most implementations flatten into
one rule:

1. **Complex content** — put `tabindex="-1"` on a static element at the start and focus that, so a
   reader can navigate the structure (lists, tables, paragraphs) rather than landing mid-form.
2. **Large content** — focus a static element such as the title, if focusing the first interactive
   element would scroll content out of view.
3. **Destructive actions** — consider focusing the **least destructive** button.
4. **Informational dialogs** — focus the frequently-used element, such as OK or Continue.

**Focus restoration:** *"When a dialog closes, focus returns to the element that invoked the
dialog"*, unless the invoker no longer exists or the workflow says otherwise.

### 4b. aria-at coverage — **present**, and it is unusually pointed

`w3c/aria-at`, `tests/apg/`: **`modal-dialog` is one of the 40 plans**, and it has a full
`data/assertions.csv` (newer layout). Read 2026-08-23. Twenty assertions:

| Assertion id | Priority | Conveys | Ref |
| --- | :-: | --- | --- |
| `roleDialog` | 1 | role "dialog" | |
| `nameAddDeliveryAddress` | 1 | name "Add Delivery Address" | |
| `nameAddressAdded` | 1 | name "Address Added" (the second, nested dialog) | |
| `dialogDescriptionAs…` | 1 | the full description sentence, verbatim | |
| `roleHeading`, `headingLevel2` | 1 | role "heading" and level 2 | |
| `roleButton`, `nameCancel`, `nameClose`, `nameVerifyAddress` | 1 | button role and names | |
| `nameFocusedElementOk`, `roleFocusedElementButton` | 1 | the **focused** element's name and role | |
| `nameStreet`, `nameInputStreet`, `theAbilityToEnterOrEditText` | 1 | the text field's label and editability | |
| `interactionModeEnabled` | 2 | the reader switched from reading to interaction mode | |
| **`cursorAtAddDeliveryAddressHeading`** | **1** | **the reading cursor is positioned at the heading** | **`aria-modal`** |
| **`cursorAtCancelButton`** | **1** | the reading cursor is positioned at the Cancel button | **`aria-modal`** |
| **`cursorAtAddressAddedHeading`** | **1** | the reading cursor is at the second dialog's heading | **`aria-modal`** |
| **`cursorAtOKButton`** | **1** | the reading cursor is at the OK button | **`aria-modal`** |

The four `cursorAt…` assertions are the whole argument for the native element, and they are the
reason `research-popover.md` §7.1 marked R7 priority-1. They are not about focus — they are about
where the **reading cursor** lands, which is a screen reader's separate, virtual cursor. A
hand-rolled focus trap moves focus and leaves the reading cursor free to walk out into the page
behind. `showModal()` makes the rest of the document inert, so the cursor cannot leave. **Their
`refIds` is `aria-modal`**, which is exactly the tension in §2.3: aria-at attributes the behaviour
to the attribute, while the native element delivers it without one.

Note also `nameAddressAdded` and `cursorAtAddressAddedHeading`: **the plan's fixture is a nested
dialog**. Nesting is not an exotic case; it is in the reference.

### 4c. Expected announcements, derived from those assertions

The aria-at reference is an "Add Delivery Address" dialog with a level-2 heading, a Street text
field, Verify Address / Cancel / Close buttons, and a second "Address Added" dialog with a
description and an OK button.

**Sequence A — the dialog opens**

1. → "Add Delivery Address" (`nameAddDeliveryAddress`, p1)
2. → "dialog" (`roleDialog`, p1)
3. → the focused element's name and role — for this fixture, the first control
   (`nameFocusedElementOk` / `roleFocusedElementButton` are the second dialog's version, both p1)
4. → NVDA: a focus-mode change (`interactionModeEnabled`, **p2**)

**Sequence B — reading into the dialog with the reader's own cursor**

1. → the reading cursor lands on the level-2 heading (`cursorAtAddDeliveryAddressHeading`, **p1**)
2. → "heading" → "level 2" (`roleHeading`, `headingLevel2`, both p1)

**Sequence C — reading forward to the last control**

1. → the cursor reaches "Cancel", "button" (`cursorAtCancelButton`, p1)
2. → reading further **does not leave the dialog**. This is the assertion no focus trap can satisfy
   and the single strongest reason to use `showModal()`.

**Sequence D — arriving on the text field**

1. → "Street" (`nameStreet` / `nameInputStreet`, p1)
2. → the ability to enter or edit text is conveyed (`theAbilityToEnterOrEditText`, p1) — "edit" in
   NVDA, "text field" in VoiceOver

**Sequence E — the second, nested dialog opens**

1. → "Address Added" (p1)
2. → "dialog"
3. → the description sentence, verbatim, from `aria-describedby` (`dialogDescriptionAs…`, p1)
4. → "OK", "button" as the focused element (both p1)
5. → the reading cursor is inside the **second** dialog, not the first (`cursorAtOKButton`, p1).
   Nested inertness: opening a modal on top of a modal must make the first one unreachable too.

**Sequence F — `Escape`**

Not in the assertion set (aria-at asserts what is *conveyed*, and a close conveys by what the page
returns to). Ours to specify: focus returns to the invoking trigger, and the reader announces the
trigger's name and role — **which is the behaviour §2.1 says neither the platform nor QDS
provides.**

**NVDA vs VoiceOver.** `interactionModeEnabled` is p2 and NVDA-shaped; VoiceOver drives the VO
cursor with `ctrl+opt+arrow` and the `cursorAt…` assertions are written against that. A transcript
test should assert *that the cursor stayed inside*, never the exact words.

---

## 5. GitHub patterns (grep MCP)

`showModal()` (TSX) returns a sample that is unusually one-sided.

- **`facebook/astryx`'s `MobileNav.tsx`** states the whole case in a header comment: *"Uses the
  native `<dialog>` element with `showModal()` for top-layer rendering. This eliminates z-index
  stacking issues — the drawer renders above everything without manual z-index management. The
  browser provides: top layer promotion (no z-index needed), `::backdrop` pseudo-element, body
  scroll lock."* Note the last item: **the platform already does the scroll lock** QDS pulls a
  dependency in for (§2.4).
- **`facebook/astryx`'s `Drawer.tsx`** shows the modal / non-modal split cleanly: `showModal()` when
  it has a scrim, `show()` when it does not, and *"non-modal (`show()`) drawers get incrementing
  z-indexes so the last-opened one paints on top; modal drawers rely on the native top layer's
  chronological stacking instead."* That is the concrete cost of `modal={false}` and the material
  for §9 question 3.
- **`shellhub-io/shellhub`'s `BaseDialog.tsx`** carries two hard-won notes that belong in our test
  plan:
  - *"`showModal()` throws `InvalidStateError` if already open (Strict Mode double-mount)"* — so the
    open path must be guarded with `if (open && !dialog.open)`. Our resume path re-runs effects in
    a way that could reproduce this.
  - *"Handle ESC via the native `cancel` event fired by `showModal()` dialogs. Why not a global
    document keydown listener? It fires regardless of dialog stacking order. The `cancel` event is
    scoped to the topmost dialog in the top layer, so stacking works correctly."* **This is the
    correct Escape implementation and it is not obvious**; QDS gets the equivalent for free by
    listening to `close`.
- **`andremichelle/openDAW`'s `dialogs.tsx`** appends the dialog to the document, calls
  `showModal()`, and listens for `close` once — the minimal correct lifecycle.
- **Anti-pattern in the sample:** `Mintplex-Labs/vector-admin` does
  `document.getElementById(id)?.showModal()` from a click handler — imperative, id-based, and it
  bypasses any state the rest of the app holds. Common, and exactly what a headless family exists to
  replace.
- On the other side, `popover="auto"` (TSX) surfaces **`microsoft/fluentui`'s
  `PopoverSurface.tsx`**: *"Renders the popover content area as a native `<dialog popover='auto'>` so
  a single element supports both non-modal (`showPopover()`) and modal (`showModal()`) show modes;
  the choice is driven by the parent `Popover`'s `trapFocus` prop."* One element, two modes — the
  unification `research-popover.md` §7.4 named as the thing that would give back a focus-trapping
  popover.

---

## 6. What modal needs from the framework — narrowing the overlay memo

`research-popover.md` §7.1 tabulated fifteen requirements across the five overlay families. Rather
than restate it, this section takes only the rows where **modal's column differs from popover's**,
and adds what has landed since.

| # | Requirement | Modal's column in the memo | Now |
| --- | --- | --- | --- |
| R2 | elevation | ✓, met by `<dialog>.showModal()` | unchanged |
| R3 | **focus restoration to the invoker on close** | ✓ needed, and **`<dialog>` does not restore at all** | still ours to do. §7 designs it |
| R4 | **close before unmount** | ✓ needed; **NOT MET**, the sharpest risk | the memo's recommendation stands: **never unmount.** The dialog is always in the tree; `showModal()`/`close()` decide visibility. §7 follows it |
| R5 | light dismiss | ~ — Escape free from `<dialog>`, backdrop guard hand-written | unchanged; QDS's two-phase guard is the algorithm (§2) |
| R6 | layering between kinds | ✓, met **only** by the platform | unchanged, and it is why we do not portal |
| R7 | **inertness + reading-cursor containment** | ✓ **modal alone**; met by `showModal()`; priority-1 in aria-at | confirmed by the four `cursorAt…` assertions (§4b) |
| R8 | anchored positioning | — not needed | a modal is centred, not anchored. **Modal is the one overlay family that needs no anchor positioning**, which means it needs no `@oddbird` polyfill and dodges the Safari 26 anchor crash the memo names as a known landmine |
| R9 | a minted id crossing trigger→surface | ✓ | **landed** (`fb9e9d01`, element handles in IDREF attributes on parts). This is what `aria-labelledby={modal.titleEl}` needs |
| R11 | **seeds from parts other than the root** | ✓ | **landed** (T051 U-H). This is exactly QDS's `isTitle`/`isDescription` mechanism (§2), and it is what makes the no-dangling-IDREF behaviour reproducible. **Hole: parts inside `@if` arms are not pre-seeded** — an `@if`-armed `modal.description` would not register itself |
| R13 | timers and delays | — not needed | modal has no delays. Another row where modal is the easy one |
| R14 | a runtime-growing list | — not needed | that is toast's problem |

**Modal's needs, in one sentence:** everything modal needs is either supplied by `<dialog>` or has
landed, **except focus restoration (R3) and the never-unmount discipline (R4)** — and R4 is a design
rule we adopt, not a capability we wait for.

That makes modal, on the framework's side, the **least blocked family in this tranche**. It is
gated by a decision, not a gap.

### The `overlay` mark, and why modal does not wait for it

`research-popover.md` §7.0 established that the `overlay` mark is collected, validated and arm-aware,
and lowers to nothing — and §7.3 concluded that on the web the emitter is not needed at all, because
`<dialog>` and `popover="auto"` are things our families write directly. Its recommendation was to
stamp the mark anyway ("inert today, correct the day it lands") and to re-examine treating the
emitter as a hard tranche-4 gate.

**That re-examination is the owner ruling that is still pending.** Modal should stamp `overlay` on
its content and otherwise proceed as if the emitter does not exist, which is both what works today
and what stays correct if the emitter lands. But the *scheduling* of this family sits behind the
ruling, and this note does not pre-empt it.

---

## 7. Markless API design

### Parts

`modal.root`, `.trigger`, `.content`, `.title`, `.description`, `.close` — the QDS `index.ts`
exactly.

No `backdrop` part: `::backdrop` is a pseudo-element the consumer styles, and it needs no element.
No `portal`, no `positioner`, no `overlay` part: those are the seven portal libraries' workarounds
for a missing platform, per `research-popover.md` §7.4.

### Types (`modal-types.ts`)

```ts
import type { ElementHandle, Handler, PropsOf, Seeded } from '@markless/core';

type TriggerProps = PropsOf<'button'>;

export type ModalRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** The dialog is showing. Omit it and it starts closed. */
	readonly open?: boolean;
	/** Pressing the page behind closes it. Omit it and pressing behind does close it. */
	readonly dismissable?: boolean;
	/** The dialog interrupts to confirm something, so it announces as an alert. */
	readonly alert?: boolean;
	/** Called with the new state when the dialog opens or closes. */
	readonly onChange?: (open: boolean) => void;
};

export type ModalTriggerProps = Omit<TriggerProps, 'onClick'> & {
	readonly onClick?: Handler<TriggerProps['onClick']>;
};

export type ModalCloseProps = Omit<TriggerProps, 'onClick'> & {
	readonly onClick?: Handler<TriggerProps['onClick']>;
};

export type ModalContentProps     = PropsOf<'dialog'>;
export type ModalTitleProps       = PropsOf<'h2'>;
export type ModalDescriptionProps = PropsOf<'p'>;

export type ModalInstanceState = Seeded<ModalRootProps, 'open' | 'dismissable' | 'alert'> & {
	/** A `modal.title` mounted, so the dialog can name itself from it. */
	titled: boolean;
	/** A `modal.description` mounted. */
	described: boolean;
	/** Whether a press that is finishing began outside the dialog box. */
	pressedOutside: boolean;
	titleEl: ElementHandle<HTMLElement>;
	descriptionEl: ElementHandle<HTMLElement>;
	contentEl: ElementHandle<HTMLDialogElement>;
	triggerEl: ElementHandle<HTMLButtonElement>;
};
```

`closeOnOutsideClick` is renamed `dismissable`, because the behaviour is "pressing outside dismisses
it" and the QDS name describes the implementation. This is a deviation from a QDS *prop* name, not
from its part list, and it is small; §9 question 4 offers it back.

`level` is **absent**. It exists in QDS only to gate the scroll-lock release (§2.5), and with no
scroll-lock dependency there is nothing to gate — the browser's top layer already stacks dialogs
chronologically, and the `cancel`/`close` events are scoped to the topmost one (§5, shellhub).

### Sketch

```tsx
export const modalState = shared(() => {
	const modal: ModalInstanceState = state({
		open: false, dismissable: true, alert: false,
		titled: false, described: false, pressedOutside: false,
	});
	const titleEl = element<HTMLElement>();
	const descriptionEl = element<HTMLElement>();
	const contentEl = element<HTMLDialogElement>();
	const triggerEl = element<HTMLButtonElement>();

	return {
		...modal, titleEl, descriptionEl, contentEl, triggerEl,
		onChange: undefined as ((open: boolean) => void) | undefined,
		setOpen(next: boolean) {
			if (modal.open === next) return;
			modal.open = next;
			modal.onChange?.(next);
		},
	};
}, { scope: 'widget' });

export function ModalContent({ children, ...rest }: ModalContentProps) @{
	const modal = modalState();

	// A real <dialog>, always in the tree. `open` never removes it: an element
	// must be told to leave the top layer while it is still attached
	// (research-popover.md §7.2, R4), and removing it first strands the browser
	// holding a top-layer entry for a detached node.
	<dialog
		{...rest}
		el={modal.contentEl}
		overlay
		role={modal.alert ? 'alertdialog' : undefined}
		aria-labelledby={modal.titled ? modal.titleEl : undefined}
		aria-describedby={modal.described ? modal.descriptionEl : undefined}
		attach={(el) => {
			// showModal() throws InvalidStateError on an already-open dialog
			// (§5, shellhub) — guard both directions.
			if (modal.open && !el.open) el.showModal();
			if (!modal.open && el.open) el.close();
		}}
		onClose={() => {
			// Every browser-initiated close lands here: Escape, `cancel`, the
			// top-layer stack. Mirror it back into state, then restore focus —
			// the thing <dialog> does not do (§2.1).
			modal.setOpen(false);
			modal.triggerEl?.focus();
		}}
		onPointerdown={(event) => {
			const box = (event.target as HTMLElement).closest('dialog');
			modal.pressedOutside = box ? outsideBox(box, event) : false;
		}}
		onPointerup={(event) => {
			const box = (event.target as HTMLElement).closest('dialog');
			// Both ends outside: a drag that starts inside and ends on the
			// backdrop is a text selection, not a dismissal.
			if (modal.dismissable && modal.pressedOutside && box && outsideBox(box, event)) {
				modal.contentEl?.close();
			}
			modal.pressedOutside = false;
		}}
	>{children}</dialog>
}

export function ModalTitle({ children, ...rest }: ModalTitleProps) @{
	const modal = modalState();
	modal.titled = true;      // a part seeding its root — landed, T051 U-H

	<h2 {...rest} el={modal.titleEl}>{children}</h2>
}
```

`outsideBox` is a pure module-scope helper over `getBoundingClientRect()` — QDS's `isBackdropClick`,
unchanged. Module-scope declarations are carried into handler symbol modules on this tip
(`f18b6c23`), and a *function* named by two handlers is fine: `MARKLESS_MODULE_INSTANCE_DIVERGENT_HANDLERS`
fires only on `new X()` initializers (`moduleScopeInstanceNames` in `symbol-modules.ts`).

### Focus restoration, designed

R3 is the family's one real piece of behaviour, and it is three lines:

1. `modal.trigger` writes its element into `modal.triggerEl` with `el={modal.triggerEl}`.
2. `onClose` on the dialog calls `modal.triggerEl?.focus()`.
3. Everything that closes — the close button, the backdrop guard, Escape, `cancel` — routes through
   `dialog.close()`, which fires `close`, which fires the restoration exactly once.

Routing every close through the platform method rather than through a state flip is what makes (3)
true, and it is the same discipline R4 demands. **One rule covers both.**

One caveat the otp note supplies: `element()` handles are **`undefined` inside a handler after SSR
resume** — *"the handle is not rebound to the served node"*
(`packages/headless/components/src/otp/note.md`, "Pinned row"). So `modal.triggerEl?.focus()` may be
a no-op on the first close after a resume. **Named as an expected pin**, with a fallback route
(`document.querySelector` off the dialog's own `id`) if the handle rebinding does not land first.

### What is not expressible today

| Wanted | Blocked by |
| --- | --- |
| `aria-labelledby={modal.titleEl}` on `modal.content` | **not blocked** — the content is a *part*, not the root, and part-position IDREF handles landed (`fb9e9d01`) |
| an `@if`-armed `modal.description` registering itself | **R11's hole**: parts inside `@if` arms are not pre-seeded, so `described` would stay false and `aria-describedby` would not be emitted. A description that only appears in an error state is an everyday shape |
| `modal.content` inside a **flipping** `@if` arm | `MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED` — and R4 says do not want this anyway |
| focus restoration after SSR resume | the `element()`-handle rebinding gap above |

---

## 8. Test plan

`packages/headless/components/src/modal/modal.browser.ts`, scenarios under `src/modal/scenarios/`.
Part-role testids: `root`, `trigger`, `content`, `title`, `description`, `close`.

Scenarios, starter first, special cases last:

1. `basic.tsrx` — trigger, dialog, title, close button. Asserts `role` is the native dialog role,
   the name comes from the title, and **no `aria-describedby`** because no description mounted.
2. `described.tsrx` — adds a description; asserts `aria-describedby` appears and points at it.
3. `unnamed.tsrx` — no title. Asserts **no `aria-labelledby` at all** — not a dangling one (§2's
   one thing QDS gets right, and the defect three other families in this tranche have).
4. `confirm-delete.tsrx` — realistic: an alert dialog with a destructive and a safe button, the
   safe one carrying `autofocus` (the APG's situation 3, §4a).
5. `dismissal.tsrx` — the two-phase backdrop guard, four rows: press-outside-release-outside closes;
   press-inside-drag-out-release does **not**; press-outside-drag-in-release does **not**; a
   keyboard-synthesised pointer event at coordinates `(0,0)` does **not** (QDS ships all four and
   they are the family's subtlest behaviour).
6. `not-dismissable.tsrx` — `dismissable={false}`; pressing outside does nothing, `Escape` still
   closes (the platform's, and the APG requires it).
7. `nested.tsrx` — a dialog that opens a second dialog. Asserts `Escape` closes only the top one,
   the first is unreachable while the second is open, and closing the second returns focus into the
   first. **aria-at's own fixture is nested** (§4b), so this is a reference-backed scenario.
8. `long-form.tsrx` — a scrollable dialog; asserts the page behind does not scroll and the dialog
   does.
9. `with-onchange.tsrx` / `without-onchange.tsrx`.
10. `armed-description.tsrx` — a `modal.description` inside a flippable `@if` arm. **Expected to
    fail**, on R11's arm hole (§7).

Mode loop CSR/SSR for the shared rows, with literal `render`/`renderSSR` call sites. Explicit
SSR+resume rows for:

- **the served HTML contains the `<dialog>`, closed and not showing** — never-unmount, verified on
  the wire rather than only in the browser;
- opening after resume calls `showModal()` once and does not throw `InvalidStateError` (§5,
  shellhub);
- `aria-labelledby` is correct in the served HTML, before any JavaScript, because the seed phase
  runs before render;
- **focus returns to the trigger on the first close after resume** — the row expected to be pinned
  on the `element()`-handle rebinding gap (§7). Write it, pin it, and name the gap.

Behaviour rows that must be asserted directly because they are what separates this family from a
styled div:

- **`Tab` from the last control cycles to the first, and does not reach the page behind.**
- **`Escape` closes**, and — the row that catches a global keydown listener — **`Escape` in a nested
  setup closes only the top dialog** (§5, shellhub's `cancel`-not-keydown note).
- **the page behind is inert**: a button behind the dialog cannot be clicked or focused.

A screen-reader lane (`modal.sr.ts`) should carry Sequences A–F from §4c. Modal is one of the three
families in this tranche with a real aria-at plan, so the transcripts diff against
`tests/apg/modal-dialog` directly — and the **four `cursorAt…` reading-cursor assertions are the
ones worth the lane's existence**, because they are the assertions no portal implementation can
pass and no ordinary browser test can see.

---

## 9. Open questions

1. **Emit `aria-modal="true"` on a native `<dialog>`, or not?** The APG lists it as required and
   aria-at attributes the four priority-1 reading-cursor assertions to it (`refIds: aria-modal`).
   The ARIA spec discourages doubling native semantics, and `showModal()` delivers the behaviour
   without it. **Recommended: emit it.** The cost is one redundant attribute; the benefit is that a
   reader implementing the attribute rather than the element still behaves, and the aria-at
   transcripts have the reference they name. This is a deliberate redundancy and should be argued in
   the code comment, not silent.
2. **`role="alertdialog"` as a prop, or a separate family?** **Recommended: a prop** (`alert`).
   Radix, Base UI and Kobalte ship a separate component; the APG treats it as a variant; the only
   difference is one attribute and a convention about initial focus. A second family for one
   attribute is not worth six more parts.
3. **Ship a non-modal mode (`<dialog>.show()`)?** **Recommended: not in v1.** It loses inertness,
   reading-cursor containment and top-layer stacking — the three things this family is for — and
   `facebook/astryx`'s `Drawer.tsx` shows the price: non-modal dialogs need hand-managed z-indexes
   (§5). A non-modal anchored surface is what popover is.
4. **`dismissable`, or QDS's `closeOnOutsideClick`?** **Recommended: `dismissable`**, because it
   names the behaviour rather than the implementation and reads the same way in the docs sentence
   ("press outside to dismiss it"). Offered back to the owner because QDS-is-the-API is a standing
   order and this renames a QDS prop.
5. **Focus restoration after SSR resume.** `element()` handles are `undefined` inside a handler
   after resume (otp note). Restoration is an APG requirement, so a permanently-pinned row here is
   not acceptable long-term. Either the handle rebinding lands, or the family needs a documented
   fallback. **Wants a decision on which**, not just a pin.
6. **The `overlay` mark's emitter, and whether tranche 4 waits on it.** `research-popover.md` §7.3
   argued the emitter satisfies elevation *portably* and is **not needed for the web families to
   work**, and recommended re-examining it as a hard gate. **That ruling is still pending with the
   owner, and modal's scheduling sits behind it.** Modal should stamp `overlay` on its content
   either way: inert today, correct the day it lands.
