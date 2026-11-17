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
| u4 | overlay (`popover`) | stopped | stopped | stopped | stopped | Dragon refuses it (below) |
| u5 | `toggle`: label, switch, thumb, description | pass | pass | pass | pass | none |

Receipts: one harness run of the fourteen core rungs and u1, u2, u3 and u5, both platforms, `proof passed on iOS and Android`,
18 of 18 on each
(`receipts/2026-11-17-ui-{ios,android}-18-rungs.json`, `receipts/2026-11-17-ui-verdict.txt`; simulator `markless-native-ui`,
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

**u4 overlay (stopped).** `popover` is refused by name: its `dismiss` handler reads `document.activeElement`, calls
`surface.contains(...)` and reads `event.detail.pressTarget`, and its close part calls `popover.triggerEl.focus()`; no host
has the overlay primitive (`dismiss` from Escape, the back gesture or an outside press). Dragon refuses the family's own
defaults: the `overlay` attribute (not proven rendering-neutral), `anchor-name`/`position-anchor`/`anchor-scope` ("Dragon
implements no anchor positioning yet") and `position: absolute` beside text (`POSX-IFC`). What each phone gesture should
mean, from this evidence: Escape → Android back and the iOS escape gesture map to `dismiss` reason `escape`; outside press →
kept (a tap outside the surface); focus trapping → `aria-modal` maps to `accessibilityViewIsModal` / hiding siblings from
TalkBack. None of this is built.

**u5 toggle.** The trigger reads `toolbarState()` from another file; the build now analyzes each module with the interfaces
of the modules it imports, as the web build links them. `aria-labelledby`, `aria-describedby` and `<label for>` lower to node
ids. Hosts: `role="switch"` maps to the iOS toggle-button trait with value `1`/`0`, and to `android.widget.Switch`,
checkable and checked; the label and hint come from the referenced elements' text, refreshed after every journal; a
`<label for>` forwards its tap and is hidden from the screen reader; on Android a button holding an element (the thumb) is a
box that reads as a Button; on iOS's stacking layout a control with no text (the switch, whose only child is the empty
thumb) gets the 44 pt touch target, since it was 0 by 0 and untappable. The optional `toggle.field` part is refused (`checked` as a property binding on a hidden
`<input>`); #735's researched default is that it renders nothing on a phone, which is an owner call.

## Accessibility, as the devices report it

Maestro reads label, value, hint, enabled and checked from the accessibility tree but not the role. The flows assert texts
and accessible names ("Wi-Fi" is the switch's name through `aria-labelledby`; the label itself is hidden from the screen
reader). Role checks (switch, tab) are not in the flows: they need an XCUITest or UiAutomator assertion, which the harness
does not have.

## Remaining families (46 folders counted, `base` included)

`packages/mobile/proofs/ui-family-probe.ts` compiles one synthetic app per family (its root holding every exported part)
and `ui-family-probe.json` beside this note is its output. Synthetic usage, so a refusal names a missing capability, not a
verdict on a real app. Verdicts:

- **Works with what now exists** (rung or probe payload): base, collapsible, tabs, toggle (without `field`).
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
