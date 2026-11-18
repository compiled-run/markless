# @markless/ui on iOS and Android: the u-ladder

Branch `cw/native-ui` (base `cw/native-targets`). Owner direction, 2026-11-17: the headless families compile and run on
phones unchanged for the app author, with Dragon turning their CSS into native style data. Each rung is a real family used
as an app author writes it (`import { tabs } from '@markless/ui'`), proven in four columns: **web** (the rung built as a
router app and driven in Chromium, `packages/mobile/test/ladder-web.test.ts`), **reference** (the native payload walked
by the reference runtime, `ladder-native-reference.test.ts`), **iOS** and **Android** (the rung's Maestro flow on the
simulator and the emulator through the proof harness). No family source was changed for any rung.

## Rungs

| Rung | Family | Web | Reference | iOS | Android | Styles |
|---|---|---|---|---|---|---|
| u1 | `base`: button (toggle and disabled), separator, label | pass | pass | pass | pass | none: `base.button` cannot take a class (below) |
| u2 | `collapsible`: root, trigger, content | pass | pass | pass | pass | Dragon: `.trigger[ui-open]` and `[hidden]` per state |
| u3 | `tabs`: three triggers, three panels | pass | pass | pass | pass | none: the selected value is a string (below) |
| u4 | plain `<dialog>` (`showModal()`/`close()`) | pass | pass | pass | pass | none: Dragon has no `<dialog>` (below) |
| u4b | `modal` | stopped | stopped | stopped | stopped | |
| u4c | `drawer` (the bottom sheet) | stopped | stopped | stopped | stopped | |
| u5 | `toggle`: label, switch, thumb, description | pass | pass | pass | pass | none |
| u11 | `pagination`: root, back and forward, three items with triggers; an author computed with a block body | pass | pass | pass | pass | none |

Receipts: one harness run of the fourteen core rungs and u1 to u5, both platforms, `proof passed on iOS and Android`,
19 of 19 on each
(`receipts/2026-11-17-ui-{ios,android}-19-rungs.json`, `receipts/2026-11-17-ui-verdict.txt`; simulator `markless-native-ui`,
iPhone 17, iOS 27.2; AVD `markless_native_ui`, API 36); screenshots under
`packages/mobile/proofs/u<n>-<family>/screenshots/{ios,android}/`. What is a test double: nothing in the device columns
(real compiler, real hosts, real Dragon export, real simulator and emulator); the reference column is the TypeScript
runtime and a mirror host, not a device.

## What each rung needed

**u1 base.** Compiled unchanged once the native pass learned: components reached through a package barrel
(`@markless/ui` → `export * as base` → `export { default as button }`, from the analyzer's re-export facts); a state object
split into one cell per field (`press.pressed`); a state's first value folded at build time from the instance's props
(`pressed !== undefined`); an absent prop reading its default or `undefined`; `if (...) return;` in a handler; a member
write; a callback prop called with an argument (`onChange?.(press.pressed)` runs the caller's `(next) => (saved = next)`
with `next` bound). Hosts: iOS built `<label>` (it refused it before) and its attribute writer now treats `null` as absent,
as the web does (the Save button was disabled on iOS by `disabled={undefined}`; the new `guards.json` vector pins it).
Dragon: `base.button` has a closed prop list with no `class`, so an author cannot style it; Chrome draws it with the
platform button theme, which Dragon refuses (`FORM-b`, inline-block atomic inlines, the UA Arial font). u1 therefore runs on
the hosts' stacking layout. `base.visuallyhidden` compiles but Dragon refuses its inline `style` attribute
(`DRAGON_UNSUPPORTED_ATTRIBUTE ... the style-attribute package SOV`), so on a phone it would be drawn: left out of u1.

**u2 collapsible.** Needed `shared(..., { scope: 'subtree' })`: one instance per root, reached by the trigger and the
content the app passes as children (the instance follows the render tree, not the caller's scope); methods (`toggle()`),
callback slots (`collapsible.onChange = onChange` while rendering, run from the method), render-time seeds as first values,
`{...rest}` props on the part's element (`class="trigger"` arrives with the app's scope class), `el={handle}` and
handle-valued attributes (`aria-controls` lowers to the content's node id). The `beforematch` handler is left out: a phone
has no find-in-page. Hosts: `hidden` hides the view (stacking layout) and an element Dragon gives no box is hidden (styled
layout); `aria-hidden` hides a subtree from VoiceOver and TalkBack. Dragon: bound `ui-*` attributes and `hidden` now reach
it per state (`attributesByState`); its markless adapter escapes instance ids (`component-edge:0/h1`); its resolver applies
the UA rule `[hidden] { display: none }`; `hidden="until-found"` (the family's default closed state) is refused by name
because Chrome draws it with `content-visibility: hidden`, which Dragon does not lay out, so the rung sets
`disableUntilFound`. Both hosts draw solid borders only (a dashed panel border was refused on both).

**u3 tabs.** Each trigger roots its own part instance (`tabsPartState`), the list's `aria-label` is a rest prop, and
`show(next)` tests the state it then writes, so handlers gained a real `if` op (test once, run one branch) in the payload,
the reference runtime and both hosts (vector `guards.json`). The triggers' `focus` and `keydown` handlers (roving focus,
arrow keys, select on focus) are left out with a `MARKLESS_NATIVE_KEYBOARD_ONLY` warning naming each: on a phone only a
hardware keyboard raises them, and hosts have none yet. Dragon: the selected value is a string, and Dragon's per-state
styles take true/false states only, so the panels' `hidden` could not follow it under Dragon; u3 runs on the stacking layout.

**Overlays: what modal and drawer are built on.** Neither uses `<dialog>` or `popover`. Each is an ordinary `<div>` backdrop
carrying the bare `overlay` attribute, which `@markless/web` enlists (Escape and outside presses reported as `dismiss`,
`aria-modal` read off the subtree to make the page inert and lock scroll), wrapping a `role="dialog"` content element
(`modal/note.md`). There is no `sheet` family: the bottom sheet is `drawer` (parts root, trigger, backdrop, content,
title, description, close; `orientation` defaults to vertical), which adds swipe-to-close and snap points over modal.

**u4 plain `<dialog>`.** An author's `<dialog el={dialog}>` opened with `dialog?.showModal()` and closed with
`dialog?.close()`. Compiler: `showModal()`/`close()` on a handle bound to exactly one `<dialog>` lower to a `dialog` op;
`<dialog open>` is refused by name (the web shows it non-modal, in the page flow). Payload, reference runtime and both
hosts: the `dialog` op, a `{ op: 'dialog', node, open }` journal entry and a `cancel` action that closes it (vector
`dialog.json`). Hosts: a top layer above the page and the bars holding the dialog's own views (not a system sheet), on
Chrome's default `::backdrop` tint, centred as the web centres a modal dialog (a second dialog with `role="alertdialog"`
shows the same; per the owner's direction no family or `<dialog>` adapts into a bottom sheet on a phone, and the platform's own
sheet is the separate `system.sheet` work); the page behind is inert to the screen reader (iOS `accessibilityViewIsModal`,
Android `IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS`); safe-area and keyboard insets pad the layer; Android's back
gesture (`OnBackInvokedDispatcher`) and VoiceOver's escape gesture close it as a cancel. Proven: the flow on both phones,
and an extra Android-only Maestro flow (open, `back`, closed with nothing deleted, app still open). Not proven on a device:
the VoiceOver escape gesture, which Maestro cannot perform. Dragon refuses `<dialog>` (`DRAGON_UNSUPPORTED_ELEMENT`:
"renders in the top layer with a ::backdrop") and its `open` attribute, so u4 runs on the stacking layout; styling a top
layer and `::backdrop` through Dragon is Dragon work.

**u4b modal (stopped).** Refused for five things. Buildable without a decision: the `dismiss` event from the host's top
layer (back gesture and Escape as reason `escape`, `event.detail.reason` as an expression) and `const` locals in the
dismiss handler. Not buildable without a decision: `focusBackToOpener` (`modal-focus.ts`) reads the overlay's focus origin
from a browser property (`__marklessOverlayFocusOrigin`, `instanceof HTMLElement`, `ownerDocument.body`), so a phone needs
a portable read of "who had focus when this opened", which is new `@markless/core` API; and the backdrop press guard
(`modal-press.ts`) keeps its armed state in a module-level `WeakSet` across `pointerdown` and `pointerup`, outside graph
state on purpose (its note: a state write lands too late on the web), which is not data. Recognising that pair as a native
tap on the backdrop would mean matching the family's code, which the architecture forbids. The family's public API does
not need to change; these two internals, or the overlay primitive (a reason for a press on the layer itself), do.

**CSS defaults per platform.** None had to differ. `modal` ships no CSS defaults (its placement is the author's on every
platform); `drawer` ships its bottom-sheet placement in `@layer markless` and keeps it on phones; its `touch-action` and
`overscroll-behavior` are browser-only and have no effect where the host runs the drag. Markless CSS has no way to say "on a
phone", and none is needed under the owner's direction.

**u4c drawer (stopped).** Everything modal needs, plus: its shared state's first value is not known at build time (an
analyzer gap that cascades into most of its refusals), `style={drawer.offset}` (a `style` binding), and the drag.
**The drag cannot be expressed as data today.** The rest positions and thresholds are already data the family declares
(`snapPoints`, `closeThreshold`, `orientation`, `start`, as root props seeded into shared state). But nothing declares that
an element is draggable: the gesture is `pointerdown`/`pointermove`/`pointerup` handlers that measure the surface
(`getBoundingClientRect`), compute velocity from timestamps and decide the release in `decideRelease` (`drawer-swipe.ts`),
writing `--offset` each frame. What I tried: the native probe above, and reading the handlers for a fact a host could
run. A host could only run the drag natively by re-implementing `decideRelease` itself (the behaviour would then live in
two places) or by recognising these handlers (forbidden). Making it data needs a declaration the family writes, for
example a framework attribute like `overlay` that names the axis, the rest positions and the close threshold, with the
release rule owned by the framework on every target. That is a new authoring primitive: an owner decision.

**u5 toggle.** The trigger reads `toolbarState()` from another file; the build now analyzes each module with the interfaces
of the modules it imports, as the web build links them. `aria-labelledby`, `aria-describedby` and `<label for>` lower to node
ids. Hosts: `role="switch"` maps to the iOS toggle-button trait with value `1`/`0`, and to `android.widget.Switch`,
checkable and checked; the label and hint come from the referenced elements' text, refreshed after every journal; a
`<label for>` forwards its tap and is hidden from the screen reader; on Android a button holding an element (the thumb) is a
box that reads as a Button; on iOS's stacking layout a control with no text (the switch, whose only child is the empty
thumb) gets the 44 pt touch target, since it was 0 by 0 and untappable. The optional `toggle.field` part is refused (`checked` as a property binding on a hidden
`<input>`); #735's researched default is that it renders nothing on a phone, which is an owner call.

u11 receipt: the fourteen core rungs, u1 to u5 and u11 on simulator `markless-ui-hb` (iPhone 17, iOS 27.2) and AVD
`markless_ui_hb` (API 36), 20 of 20 on each, `proof passed on iOS and Android`
(`receipts/2026-11-17-ui-hb-{ios,android}-20-rungs.json`, `receipts/2026-11-17-ui-hb-verdict.txt`). The iOS report comes from
a run whose Android half lost the emulator (`device offline` at launch on five rungs, none of them u11); Android was then run
again alone over all twenty.

**u11 pagination (handler bodies).** The family's methods declare `const` locals and then write the state those locals
read (`const next = pagination.page + 1; pagination.page = next; pagination.onChange?.(next)`), and `goTo(value = 1)` has a
defaulted parameter. The analyzer now records a handler's `const` (including `const { a, b: c } = x`) as a statement, a
parameter default as `const value = value ?? 1`, TypeScript-only wrappers (`as`, `satisfies`, `!`) as the value they wrap,
and a computed's block body as one tree: `const` becomes a `let` node, `if`/`else` a conditional, falling off the end
`undefined`. The native pass reads a `const` as its value where it is read; when the statements after it may write a cell the
value reads before reading the `const` (the pagination shape), the value is first written to a cell the build makes for it
(`handler:<id>/kept:<n>`, named after the `const`) and the rest reads that cell, so the `const` keeps the value it had where
it was declared. A call argument the called body changes before reading is kept the same way; before, such a call was refused,
and a call whose body was a single `if` op slipped past that check and lowered with the value read after the write (popover's
`setOpen(popover.open !== true)`). No payload, host or runtime change: a kept value is an ordinary cell and an `assign` op.
Still refused by name: `let`/`var` declarations, a declaration in a bare `{ }` block inside a handler, array destructuring,
destructuring with a default, rest or computed key, and in a computed any statement other than `const`, `if` and `return`.
The app's `label` computed (`const last = shown === 3; if (last) return 'Last page'; return \`Page ${shown}\``) runs on the
phones; no family's block-bodied computed is free of other blockers yet (most remaining ones use `typeof` or a helper call).

## Handler gaps each proved family hit (against draft #807's handler-boundary study)

#807 counts what lowers on the base branch; this branch adds some of its named extensions. Per family, what it hit and how
it got past it, with no family source changed:

- **base (button):** if and early return (`if (!press.isToggle) return;`): the `if` op; writing a field of a state object
  (`press.pressed = ...`): state objects split into one cell per field; calling a function it was given with an argument
  (`onChange?.(press.pressed)`): the caller's callback inlined with the parameter bound.
- **collapsible:** inlining a call to its own function (`collapsible.toggle()`): shared() methods carry their bodies and are
  inlined; a field write on shared state; if and early return; a callback slot filled while rendering; `beforematch`: left
  out, since a phone has no find-in-page.
- **tabs:** the same method and field gaps (`tabs.show(tab.value)`), plus a test over the state the branch writes, which is
  why `if` is an op and not a guarded write; key and focus listeners (roving focus, `nextTriggerToFocus`, `next.focus()`):
  not passed, left out with a `MARKLESS_NATIVE_KEYBOARD_ONLY` warning, because only a hardware keyboard raises them on a phone.
- **toggle:** method, field write and callback gaps as above; a shared() definition read from another file (`toolbarState()`):
  each module analyzed with the interfaces of what it imports.
- **plain `<dialog>`:** element commands (`dialog.showModal()`, `dialog.close()`): a `dialog` op the hosts run. Other element
  commands (`focus`, `scrollIntoView`) are not built.
- **pagination:** `const` locals written back to the state they read, and a defaulted method parameter: kept values and
  parameter defaults (u11).
- **modal and drawer (stopped):** the gaps they hit that this branch did not close are #807's "touch the page" class (the
  focus-origin expando, a module-level `WeakSet`, `getBoundingClientRect`, per-frame pointer math) and the pointer and
  `dismiss` events no payload event maps. They are recorded above, not dodged.

## Accessibility, as the devices report it

Maestro reads label, value, hint, enabled and checked from the accessibility tree but not the role. The flows assert texts
and accessible names ("Wi-Fi" is the switch's name through `aria-labelledby`; the label itself is hidden from the screen
reader). Role checks (switch, tab) are not in the flows: they need an XCUITest or UiAutomator assertion, which the harness
does not have.

## Remaining families (46 folders counted, `base` included)

`packages/mobile/proofs/ui-family-probe.ts` compiles one synthetic app per family (its root holding every exported part)
and `ui-family-probe.json` beside this note is its output. Synthetic usage, so a refusal names a missing capability, not a
verdict on a real app. Verdicts:

- **Works with what now exists** (rung or probe payload): base, collapsible, tabs, toggle (without `field`); pagination's
  root, back, forward, item and item trigger (u11; `entries` and `itemlink` are still refused, below).
- **Needs one capability:** checkbox (the `field` part's `checked` property: render nothing, or a property binding);
  textbox (`<textarea>`); tree (a `@for` whose rows render components from another module); hovercard, tooltip (overlay
  primitive and pointer hover; hovercard is web-only per #735).
- **Needs several capabilities:** accordion, buttongroup, checklist, gridlist, otp, pagination, progress, radio-group,
  select, slider, table, toolbar: computeds with block bodies (`const` in a body), `@for` rows of family components, rest
  props that are objects, property bindings, `<select>`/`<option>`/`<table>` elements.
- **Needs the overlay primitive and focus:** popover, modal, drawer, menu, menubar, combobox, calendar, colorpicker, tour,
  navbar.
- **Needs pointer events and synchronous geometry:** carousel, crop, ink, pad, rating, resizable, colorpicker, numberbox.
- **Needs text-entry features** (paste, composition, selection): datebox, timebox, editable, taglist, tokenbox, numberbox.
- **Unknown:** fileupload (file picker, drag and drop), qr-code (`<svg>`/`<path>` and a helper call), toaster (an `app`
  scoped shared() and timers).

Cross-cutting, by how many families each blocks in the probe: keyboard and focus handlers (32, left out with a warning);
names the pass does not resolve yet (26); calls to helper functions or DOM methods (23); `@for` shapes (20); components a
`@for` row renders from another module (19); reading a state object or handle whole (18); `const` inside a handler (17);
the `dismiss` event (13); initial values not known at build time (13); pointer events (11); `style=` bindings (10).

## Proposed split into parallel jobs (no two touch the same files)

1. **Handler bodies** (compiler `expression-tree.ts`, `native-view.ts` statement lowering): `const` locals in handlers and
   computeds with block bodies, as let-bound expressions. Unblocks the most families.
2. **Rows of components** (`native-view.ts` repeat lowering only, plus `collect-repeat.ts`): `@for` rows that render family
   parts, `@empty`, handlers in rows.
3. **Overlay primitive** (hosts: new `Overlay.swift`, `Overlay.kt`; serializer: a `dismiss` event): Escape/back/outside
   press, modal isolation, a portable focus read and `focus` op. Needs the owner's answer on which focus.
4. **Dragon** (Dragon repo): anchor positioning, `overlay`, inline `style`, `content-visibility` for `until-found`, states
   that are not true/false, dashed borders on both hosts' paint (`ViewTree.swift`/`MarklessHost.kt` paint functions only).
5. **Pointer and geometry** (hosts' gesture code, a geometry read in the runtime): slider, pad, crop, resizable, rating.
6. **Text entry** (input host code, `<textarea>`, paste, selection): textbox, editable, datebox, timebox, taglist.

## Setup on a third machine

1. Xcode with an iOS simulator runtime; create the harness's simulator yourself when two runtimes share a version (this
   machine had a device-specific iOS 27.2 runtime the harness picked first, which `simctl create` rejected):
   `xcrun simctl create markless-native-ui "iPhone 17" com.apple.CoreSimulator.SimRuntime.iOS-27-2`.
2. Android SDK at `~/Library/Android/sdk` with platform-tools, emulator, build-tools 36.0.0, platform android-36 and the
   `android-36 google_apis arm64-v8a` image; `kotlinc` and `maestro` on PATH. The harness creates the AVD
   (`--avd markless_native_ui`).
3. Dragon: `git -C <dragon checkout> worktree add ~/wt/dragon/native-ui-styles origin/cw/native-ui`, `pnpm install` there,
   and `export MARKLESS_DRAGON_DIR=~/wt/dragon/native-ui-styles`.
4. `pnpm install` in Markless, then `pnpm --filter @markless/mobile proof --simulator markless-native-ui --avd
   markless_native_ui --port 5584 proofs/u1-base ...`. Under `~/.claude/bin/heavy`, `--keep-devices` does not survive the
   job: heavy stops the emulator it leaves behind.

## Overlay primitive (job 3): modal and popover on phones

Owner rule for this job: the web's behaviour and family source are the reference. No family source, family API, mark or
web runtime behaviour changed; the native pass and the hosts supply what the families' web code already reads.

| Rung | Family | Web | Reference | iOS | Android | Styles |
|---|---|---|---|---|---|---|
| u20 | `modal` (and `alert`): trigger, backdrop, content, title, description, close | pass | pass | pass | pass (back gesture included) | none: stacking layout, centred top layer |
| u21 | `popover`: trigger, content, title, description, close | pass | pass | pass | pass (back gesture included) | none |

Receipts: one harness run of the fourteen core rungs, u1 to u5, u11, u20 and u21, both platforms, 22 of 22 on each,
`proof passed on iOS and Android` (`receipts/2026-11-18-ui-overlay-{ios,android}-22-rungs.json`,
`receipts/2026-11-18-ui-overlay-verdict.txt`; simulator `markless-ui-ov`, AVD `markless_ui_ov`, port 5590). Owner
answers: a tap focuses the control it presses, as a click does in Chromium; a press on empty screen reports as the
page's root element, standing in for `body`.

What the families read, and how each is supplied without a change to them:

- **The `dismiss` event.** `onDismiss` is a native event; `event.detail.reason` and `event.detail.pressTarget` are event
  fields. The runtime keeps the overlay stack the web keeps (an `overlay` element enlists when its `hidden` binding shows
  it; modal when `aria-modal="true"` is on it or inside it), reports an outside press from `pointerdown` to the topmost
  overlay the press landed outside, and the hosts send Escape from Android back and VoiceOver's escape gesture.
- **"Which element had focus when this opened".** Modal's `focusBackToOpener` reads the overlay behaviour's
  focus-origin property. The native pass lowers a read of that property (its name imported from
  `@markless/web/fns/overlay-protocol`) to `{ focusOrigin }`, which the runtime records when the overlay enlists. No new
  `@markless/core` API was needed.
- **"A press that starts and ends on the backdrop".** Modal's guard keeps a module-level `WeakSet` across `pointerdown`
  and `pointerup`. The native pass keeps a module-level `new WeakSet()` as one cell holding its members; the hosts report
  every touch's down and up on the innermost element under it (a touch on the top layer outside the lifted view is a
  touch on the overlay element itself), and the runtime runs the pointer handlers on it and each element it is inside.
  No new mark was needed.
- **Focus moves.** `el.focus()` is a `focus` op whose node is an expression (`isTriggerOpened ? trigger : origin`);
  elements are values (node ids), with `contains`, `document.activeElement`, `instanceof HTMLElement` and
  `ownerDocument.body`. Hosts move VoiceOver and TalkBack focus. Not observable from Maestro, so focus is proven by the
  vectors (`overlay.json`, `popover.json`), not on the device flows.
- **Helpers.** The families' plain functions in sibling `.ts` files are inlined (as statements, or as values; one with
  effects whose value a `const` reads runs as ops into a cell). Draft #816 adds overlapping helper inlining, `event.target`
  and `focus()` as a `command` op with a fixed node; the two branches will conflict in `native-view.ts`,
  `expression-tree.ts` and the runtimes, and modal needs a focus target computed at run time.

Not proven on a device: VoiceOver's escape gesture (Maestro cannot perform it; the iOS flow skips the back step), and
where focus lands. Drawer was not attempted: its drag is an owner decision not yet made, and it is still refused for its
shared state's first value and `style={...}`. Menu is still refused: a `style` binding, `contextmenu`, a helper with a
script-only body (`takeReturn`) and keyboard handlers.

**Web defect found and fixed (pre-existing, reproduced on `bbb807ad8`; fix `4420442ca`):** in a router production
build the overlay behaviour was never installed. The resume runtime reads `globalThis.__marklessOverlay` once at its start, and the app module that
assigns it initializes later; on the u21 page the loader is defined but no element carries `__marklessOverlayInstalled`,
and a press outside the open popover raises `pointerdown` but no `dismiss`. So on the web, popover's outside press and
Escape, and modal's Escape, did nothing on router-built pages. A root that starts first now waits in
`__marklessOverlayPending` and the emitted installer line runs it: `resume-runtime-start` +144 B rendered, recorded
from CI run 44240494177.

Family probe: 3 of 46 families built a payload before, 5 after (modal and popover moved to "works").
