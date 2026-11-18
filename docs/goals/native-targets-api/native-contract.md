# `native.sheet`: the platform's own sheet, as an explicit choice

Branch `cw/system-sheet` (base `cw/native-targets`, merged with `cw/device-more`, which carries `cw/device-slice`; the branch keeps its first working name). Owner direction, 2026-11-17: "The consumer should be able to choose
between their own level of control or native." This file is the contract for the second choice. Status: working name,
draft. Name and home, the owner's decision (2026-11-18): `import { native } from '@markless/device'`, with `<native.camera>`
to follow; the name `native` is the naming test's (`cw/device-api-ab`, `naming/report.md`). On the web, nothing under
`native.*` exists (owner decision, 2026-11-18, below).

## The two choices

| You want                                             | Write                                                        | Who draws the frame                                                                                         | Same on every platform?                            |
| ---------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Your own control: your frame, your motion, your look | `modal`, `drawer` from `@markless/ui`, or a plain `<dialog>` | You (the headless family's markup and your CSS)                                                             | Yes                                                |
| The platform's own sheet                             | `<native.sheet>` from `@markless/device`                     | The platform: iOS `UISheetPresentationController`, Android Material `BottomSheetDialog`; nothing on the web | No: each phone's real sheet, and absent on the web |

One sentence for an author: **use `drawer` when the sheet must look and move the way your design says on every platform;
use `native.sheet` when it should be the sheet people already know on their phone, with the platform's drag, heights,
dimming, keyboard and back behaviour, and you style only what is inside it.**

## How an author writes it

```tsrx
import { state } from '@markless/core';
import { native, platform } from '@markless/device';
import { drawer } from '@markless/ui';

export default function Checkout() @{
	let picking = state(false);
	let shipTo = state('nowhere yet');
	<main>
		<p>Ship to {shipTo}</p>
		<button onClick={() => (picking = true)}>Choose city</button>
		@if (!platform.web) {
			<native.sheet open={picking} onChange={(open) => (picking = open)} snapPoints={[0.5, 1]}>
				<h2>Choose a city</h2>
				<button onClick={() => { shipTo = 'Osaka'; picking = false; }}>Osaka</button>
			</native.sheet>
		} @else {
			<drawer.root open={picking} onChange={(open) => (picking = open)}>...</drawer.root>
		}
	</main>
}
```

- **Open state is the page's own state.** `open={picking}` presents the sheet while it is true; the page's handlers write
  it like any other state, and a value picked inside lands in the page's state directly (no result channel).
- **On the web it does not exist.** Every `native.*` element must sit inside a `platform` check the analyzer can see, in
  the component that renders it (`@if (!platform.web)`, `@if (platform.ios || platform.android)`); a web build removes the
  guarded markup and everything it alone uses, and refuses an unguarded use with `MARKLESS_DEVICE_WEB_ABSENT`, whose
  message teaches the fix:

    ```text
    `<native.sheet>` does not exist on the web: everything under `native.*` is drawn by iOS or Android. Guard it in the component that renders it, and draw the web's version with `drawer` from @markless/ui:

    	@if (!platform.web) {
    		<native.sheet …>…</native.sheet>
    	} @else {
    		<drawer.root …>…</drawer.root>
    	}

    `platform` comes from @markless/device. `modal` or a plain `<dialog>` also work for the web.
    ```

- **`onChange(open)`** runs when the platform closes the sheet (a swipe, the back gesture, a tap on the dimmed page),
  always with `false`. It does not run when the page itself writes `open = false`. It is the same
  word and shape as `drawer`'s and `modal`'s `onChange`; the difference is that a sheet has no trigger part, so opening is
  always the page's own write.
- **The content is ordinary Markless markup**, styled by the author's CSS (through Dragon on phones; "Styled content",
  below). **The frame is not styleable**: corner radius, grabber, dimming colour and its motion are the platform's. There
  is no `class` or `style` on `<native.sheet>`; an author who needs to style the frame wants `drawer`.

## Options

Kept to what both phones have. Each must be fixed at build time in this draft (state-driven options are refused by name).

| Option        | Default | Meaning                                                                                     | iOS                                                                              | Android                                                                                                          |
| ------------- | ------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `open`        | `false` | Shows the sheet while true                                                                  | present / dismiss                                                                | `show()` / `dismiss()`                                                                                           |
| `onChange`    | none    | The platform closed it                                                                      | `presentationControllerDidDismiss`                                               | `setOnCancelListener`                                                                                            |
| `snapPoints`  | `[1]`   | Resting heights, as fractions of the screen's height: one value, or two with the larger `1` | detents: `1` is `.large()`, `0.5` is `.medium()`, any other a custom detent      | `1` alone: expanded, skip collapsed; `[x, 1]`: `halfExpandedRatio = x`, starts half expanded                     |
| `dismissible` | `true`  | The person can close it the platform's way                                                  | `isModalInPresentation = !dismissible`                                           | `setCancelable(dismissible)` (back, outside tap, swipe)                                                          |
| `modal`       | `true`  | The page behind is dimmed and cannot be reached                                             | `largestUndimmedDetentIdentifier` unset; when `false`, set to the largest detent | `BottomSheetDialog` when true; a standard bottom sheet in the page when false (not built yet, refused on phones) |

`snapPoints` and `modal` are `drawer`'s words for the same ideas (drawer measures fractions of its own size; a system
sheet's are of the screen, because that is what both platforms take). `dismissible` has no headless counterpart: `modal`'s
`alert` blocks outside presses only, and is a different idea (an alert dialog).

Why at most two heights: Android's sheet has exactly one resting height between collapsed and expanded
(`halfExpandedRatio`); a third would exist on iOS only. Why the largest must be `1`: Android's expanded state is the full
height (with `fitToContents` off); an iOS custom detent below full has no Android match.

## What each platform does

|                                      | iOS (UIKit)                                                                                       | Android (Views)                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| What is presented                    | A `UIViewController` holding the content's views in a `UIScrollView`, presented with `.pageSheet` | `com.google.android.material.bottomsheet.BottomSheetDialog` holding the content's views in a `NestedScrollView`             |
| Grabber / drag handle                | `prefersGrabberVisible = true` when there are two heights                                         | the Material 3 drag handle view when there are two heights                                                                  |
| Drag between heights, swipe to close | the system's                                                                                      | `BottomSheetBehavior`'s                                                                                                     |
| Back                                 | no back for a sheet on iOS (VoiceOver's escape gesture is the system's close request)             | the system back gesture or button (predictive back from Material)                                                           |
| Keyboard                             | the sheet rises above the keyboard (system)                                                       | `adjustResize` on the dialog window; Material insets                                                                        |
| Library                              | none (UIKit)                                                                                      | Material Components for Android (`com.google.android.material:material`), see the receipt below for what it adds to the app |

## The payload (`markless.native-view/0`, additive)

- **Node** `{ kind: 'sheet', id: 'sheet:<edge>', parent, open: NativeExpr, snapPoints: number[], dismissible, modal }`. It
  sits among its parent's children in document order but takes no place in the page's layout. Its content is the nodes
  whose `parent` is the sheet's id, in document order; they are **built at mount and kept** while the sheet is closed, so
  `text`, `attribute` and `property` entries for them apply whether it is open or not.
- **Journal** `{ op: 'sheet', node, open: boolean }` when `Boolean(open)` changes after a handler, in document order with
  the other entries. `true`: present it. `false`: dismiss it, or do nothing when the platform already has.
- **Event and action** `dismiss` on the sheet's id: a host dispatches `{ event: 'dismiss', host: <sheet id> }` after the
  platform has closed the sheet. Its handler is the author's `onChange` with its parameter bound to `false` at build time.
  A sheet whose `onChange` keeps `open` true stays closed with its state true, the same on the web (the dialog's arm
  stays, closed) and on phones: the journal follows the state's changes, not the screen.
- **Vectors**: `initialSheets: [[sheet, open]]`; file `conformance/sheet.json` (rung Y2's component: open, dismiss,
  open, type, use, open, pick).
- **Refused by name** (`MARKLESS_NATIVE_UNSUPPORTED`): a sheet inside an `@if` arm or a `@for` row; `open` that is not the
  component's state or a literal; options not fixed at build time; `snapPoints` outside the rule above; a dismissible sheet
  without `onChange`; an `onChange` defined elsewhere; any other prop.

## Where it is imported from, and the name

`@markless/device`, as the namespace `native` (`packages/device/src/native/`), beside the device calls: the owner's rule
is that a page pays for the sheet only if it renders it, and it is not a headless `@markless/ui` family. The name lives in
one place for the compiler, `PLATFORM_PIECES_PACKAGE` (which is `DEVICE_MODULE`) and `PLATFORM_PIECES_NAMESPACE` in
`@markless/serializer/native-view`; the package exports it with one `export * as native` line. The compiler recognises the
element from the analyzer's component edge (`importSource`, `importedName`, `importedMemberPath`), so `import { native as
platformUi }` works too. Spec `11-platform-organization.md` keeps `native` off package and import names; this is an export
inside a package, which a reader of that spec may still trip on.

## On the web: absent, at the namespace level

Owner decision (2026-11-18): `native.*` follows the rule `@markless/device` features already follow on the web
(`cw/device-slice`, `cw/device-more`). It is implemented once, in that analysis (`collectWebDeviceAbsence` in
`packages/compiler/src/passes/semantic-graph/device-target.ts`): any element whose tag is a member of the module's import
of `native` from `@markless/device` (under any local name), in code the web build keeps, is refused with the message
above; one inside a
`platform` arm the build folds away is removed with the rest of that arm. `native.camera` falls under the same case
when it moves in. The web module `packages/device/src/native/index.ts` only declares the elements (typed, throwing if
ever run) so an author's code type-checks; a web build never reaches it. Proven:

- `packages/mobile/test/device-web-absence.test.ts`: a guarded `<native.sheet>` and `<native.camera>` build, and neither
  client nor server code carries the tag or its content (client code names no `@markless/device`); an unguarded one, and
  one under a renamed import, is refused with the message above, naming its own tag.
- The ladder's web column (`ladder-web.test.ts`): rungs Y1 to Y4 render their `@else` arm on the web, and no file of the
  built output contains the sheet's content or `@markless/device` (`web.absentFromOutput`).
- Byte-identical: device-slice's location rung page (it imports `location` and `platform`), built as a production web app
  at one path with and without the `native` export: all 84 output files are identical except `nitro.json` and
  `server/index.mjs`, which also differ between two builds of the same tree (build stamps).

**Why the first web version made every importer pay** (kept for the record). Not the barrel by itself (a `drawer` page
built from the same `@markless/ui` barrel was byte-identical with and without the family) but `onIdle`: with the same
module and barrel, removing only `onIdle` removed the cost (docs `/concepts/state`: 124 files and 2,759,153 B with it,
119 and 2,728,165 B without). `onIdle` installs a page-wide hook (`globalThis.__mIdle`), and a client-rendered mount
calls its wake whether or not it holds an idle record; once installed, every client-rendered mount on the page started
its runtime at idle. The five extra files were the idle runtime and four resume-runtime chunks; the sheet's own code was
not in that page's client output. The same wake started the slider's never-pressed mount in the screen-reader lane.
Traced: the idle chunk is imported by runtime chunks the page preloads; not traced: which module made the install call.

## Questions this contract does not settle (each one platform only, or not both)

- **Reading and setting the resting height** (`snapPoint`, `onSnapPointChange`, drawer's words): both platforms have it
  (`selectedDetentIdentifier` and its delegate; `BottomSheetCallback.onStateChanged`), left out of this draft to keep to
  the three options asked for.
- **Android only:** scrim colour, dismiss on outside tap separately from back (Expo's `shouldDismissOnClickOutside`), the
  peek (collapsed) height as a third rest, `fitToContents`.
- **iOS only:** more than two heights, a custom detent below full as the largest, per-height dimming
  (`largestUndimmedDetentIdentifier` at a middle detent: Apple Maps' sheet), corner radius, the iPad form sheet and the
  full-screen fallback in iPhone landscape.
- **Non-modal on Android** needs the sheet in the page's own layout (a `CoordinatorLayout`), not a dialog; refused on
  phones until built.

## Rungs (2026-11-17)

Columns as in `contract.md` section 5: **Web** is `packages/mobile/test/ladder-web.test.ts` (a real router app in
Chromium; on the web each rung shows its `@else` arm and its `web.steps`, and the built output is searched for what must
be absent); **Reference** is `ladder-native-reference.test.ts` (the real compiler's payload run by the reference runtime
through a mirror host); **iOS** and **Android** are the rung's Maestro flow on the simulator and the emulator. Device
receipt: `receipts/2026-11-17-native-sheet-y1-y3.txt` (one harness run, both platforms: "all 3 rung(s) passed on iOS and
Android"). Screenshots: `packages/mobile/proofs/y<n>-*/screenshots/{ios,android}/`.

| Rung                        | What                                                                                                                | Web                                           | Reference                                                              | iOS      | Android  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------- | -------- | -------- |
| Y1 `y1-sheet-open-close`    | open from a button; close by swipe, by back, and by the page's own button; a counter of platform closes on the page | absent, fallback shown                        | pass                                                                   | **pass** | **pass** |
| Y2 `y2-sheet-pick`          | a list and a text input inside; the pick lands on the page; keyboard up (`keepKeyboard`) while typing               | absent, fallback shown                        | pass                                                                   | **pass** | **pass** |
| Y3 `y3-sheet-heights`       | `snapPoints={[0.5, 1]}`: opens at half, pulled to full, 70 items scrolled to the last                               | absent, fallback shown                        | pass                                                                   | **pass** | **pass** |
| Y4 `y4-sheet-beside-drawer` | the same page with the headless `drawer`                                                                            | the drawer opens and closes; the sheet absent | **refused by name** (`<drawer.root>, a component from another module`) | not run  | not run  |
| Y5 confirmation             | report only, below                                                                                                  |                                               |                                                                        |          |          |

What each rung needed and what is real:

- **Y1.** Payload: the `sheet` node, `dismiss` action, `sheet` journal entry. Real on both phones: the system sheet,
  its pull-down, Android's back _gesture_ (a left-edge swipe; gesture navigation is the AVD's default). iOS has no back
  for a sheet, so its "back" step is the pull-down again; VoiceOver's escape gesture (the iOS close request) is not
  driven, Maestro cannot perform it. Test doubles: one iOS unit test calls `presentationControllerDidDismiss` directly,
  Android's in-app conformance calls the cancel path directly; neither is in the device column.
- **Y2.** Keyboard: iOS expands the sheet to full height and the field sits above the keyboard (the host also ends the
  scroll view at the keyboard's top edge as a backstop); Android's `BottomSheetDialog` with `adjustResize` on its window
  rises above the keyboard with no host inset code. Screenshots `04-type-after.png` on each platform.
- **Y3.** iOS: medium and large detents, grabber shown. Android: `halfExpandedRatio = 0.5`, `skipCollapsed`, the Material 3
  drag handle. The pull-up gesture ends at 20% of the screen: past full height iOS hands the drag to the content's
  scroll (measured). The scroll step proves scrolling only with content taller than full height (40 items fit on the
  Pixel 7, so the rung has 70).
- **Y4.** On the web the drawer opens and closes and the native sheet is absent. On phones
  the compiler refuses it because the headless `drawer` does not build for phones yet (`cw/native-ui`, u4c: its drag is
  pointer handlers, not data). This rung is a failure on phones, not a pass; it turns green when `drawer` lowers.
  The screenshot pair an author chooses between: the drawer is the author's frame on every platform; the sheet is Y1's
  phone screenshots.

**Android: where the real sheet comes from and what it costs.** `com.google.android.material:material:1.13.0`
(`BottomSheetDialog`, `BottomSheetBehavior`, `BottomSheetDragHandleView`), theme `Theme.Material3.Light.BottomSheetDialog`
passed to the dialog (the page keeps its framework theme). Its runtime closure is 53 artifacts (androidx appcompat,
core, activity, fragment, lifecycle, coordinatorlayout, recyclerview, constraintlayout, transition, kotlinx-coroutines and
more), pinned with sha256 in `packages/mobile/src/adapters/android/libraries.lock.json` and fetched by the harness
(`src/harness/android-libraries.ts`) without Gradle; the lock is written once by `resolve-libraries.sh`. Proof APK for
Y2: **885,231 → 6,705,477 bytes** as the harness builds it (d8 only, no shrinking, 22 full R classes); with R8 in a
scratch build (not installed): **82,415 → 2,297,935 bytes**. Library manifests are not merged (androidx.startup
providers are not registered; nothing here needed them). iOS needs no library (UIKit).

**iOS 27 look.** The half-height sheet floats inset from the screen edges and the page behind dims rather than shrinks:
the system's current look, which a `drawer` author would have to imitate by hand.

## Styled content (branch `cw/sheet-styled-content`, Dragon `cw/sheet-styled-content`)

Base: `cw/system-sheet` merged with `cw/native-app-styles` (#809, which carries `cw/native-nav`): page styles through
Dragon, dark-mode bands, `ui-*` state styles and the app style file are #809's (`styles-contract.md`). This section adds
the sheet's content to them.

**The rule.** An author's CSS reaches markup inside `<native.sheet>` as it reaches the same markup on the web: the
stylesheets the app and page import, then every shown component's scoped CSS (one CSS text, the page's). The content is
written as a child in the page's markup, so, as with a `<dialog>` on the web, selectors that go through its ancestors match
(`.panel .pick`), and it inherits from them (`color`, `font-size`, ...), while its layout is the sheet's own: its
top-level elements sit in the sheet's content area, so `%`, `vh`, `vw` and `min-height: 100vh` measure the sheet, and
the ancestors' own boxes (padding, borders, backgrounds, flex) take no part in it (owner decision, 2026-11-18). The area
outside the document's boxes is the canvas, as on a styled page (#809): white unless the author opts in to a dark scheme
with `color-scheme`, as a browser's canvas does (owner decision, 2026-11-18); that opt-in is refused by Dragon today
("Found on the way"). The frame around it (grabber or drag handle, corners, dimming, motion) is the platform's.

**How it reaches the phone.** For every styled page, Markless hands Dragon the page without its sheets, then each
sheet's content once per resting height (`nativeStyleInputs`, `packages/mobile/src/style-input.ts`), sized by the
content area measured for that height on each phone (`SHEET_AREAS`, `packages/mobile/src/sheet-areas.ts`). A sheet's
input lists only the styled cells its content and its ancestors read. Its markup ancestors (the page's elements from
the root down to the sheet's parent) travel with it as boxless elements (`boxless: true`): Dragon keeps them for
selectors and inheritance and gives them `display: contents`, so they have no box and no node in the export. The app style file (`markless.native-app-style/0`, additive) gains
`routes[].sheets: [{ node, heights: [{ snapPoint, viewport, readiness, states, initial, next, bands?, assignments }] }]`,
whose nodes index the same `writes` table as the page's. The hosts lay the content out at the height the sheet rests at,
switch to the other height's layout when the person drags it there (iOS
`sheetPresentationControllerDidChangeSelectedDetentIdentifier`, Android `BottomSheetCallback` at
`STATE_HALF_EXPANDED` / `STATE_EXPANDED`), and apply `state` entries and the dark-mode band to the page and every sheet
height that has that state.

**The content areas, measured** (Maestro and `uiautomator` view hierarchies, and each host's own size check):

| Resting height | iOS, iPhone 17, iOS 27.2                                                                         | Android, Pixel 7, API 36                                         |
| -------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| 1              | 402 x 778 pt (the scroll view of the `.pageSheet`)                                               | 1080 x 2075 px, 411.43 x 790.48 dp; laid out at 411 x 790        |
| 0.5            | 402 x 435.7 pt, drawn scaled to 386 pt wide and inset 8 pt from each edge; laid out at 402 x 435 | 1080 x 975 px visible, 411.43 x 371.43 dp; laid out at 411 x 371 |

Laid out in whole CSS px, as Dragon's page viewports are (Chrome, the reference, takes no other size). A first iOS
measurement read the half-height sheet's accessibility frame (386 x 418, after the scale) and laid the content out 4%
too small; the host's size check named the real size and the table was corrected. Each host logs once when a sheet shows
its content in a size more than 1 pt / dp from its layout (a phone other than these).

**What Dragon needed.** Two input fields. First, `viewports: { ios: { width, height }, android: { width, height } }` on a Markless style
input, positive whole CSS px, laid out there and recorded as the export's `viewport` (Dragon
`packages/parity/src/markless-style-input.ts`, test `markless-style-viewports.test.ts`); and `markless:style-compare
--screenshots <dir>`, which saves Chrome's rendering of each assignment, the reference read beside the phone
screenshots. Everything else (flex, `gap`, `calc()`, `vh`, `margin-top: auto`, `@media (prefers-color-scheme)`,
`[ui-*]`) compiled as it does for a page.

**Refused by name.**

- A styled sheet resting at a height not measured on both phones (`snapPoints` other than `0.5` and `1`): "a styled system
  sheet rests at 0.3, but its content is laid out only at the heights measured on both phones (0.5 and 1)". An unstyled
  sheet still takes any fraction (Y3's rule).
- A styled sheet in a one-screen rung (`App.tsrx`): its layout travels only in the app style file, so it needs an app
  (`pages/`).
- A styled page whose app style has no styles for one of its sheets (both hosts, by the sheet's id).
- Inherited from #809 and unchanged inside the sheet: `:active`, `:disabled` and the `disabled` attribute, a link's
  default underline, `html`/`body` backgrounds, `@media` features other than `prefers-color-scheme`, `@if` arms and
  `@for` rows in styled markup.

**Not covered.** A height change UIKit makes by itself (the sheet growing to full height when the keyboard rises) may not
reach the delegate, and the content would keep the half-height layout; not driven by any rung. While the person drags,
the content keeps the layout of the height it last rested at.

### Rungs Z1-Z5

Columns as above. **Web**: the app built by the router in Chromium (`ladder-web.test.ts`): the sheet is absent, the
author's `@else` arm shows, the sheet's text is in no built file, and page screenshots at each phone's size go to
`screenshots/web-{ios,android}/`. **Chrome reference**: Dragon's frames against Chrome's boxes for the page and for each
sheet height, at the export's viewport (`native-style-compare/*.json`, gate 1 device px), with Chrome's rendering in
`screenshots/chrome/<input>/`. **iOS** and **Android**: the rung's Maestro flow on simulator `markless-sheet-st` and AVD
`markless_sheet_st`, screenshots in `screenshots/{ios,android}/`.

| Rung                           | What                                                                                                                                                                                                                                      | Web                                    | Reference runtime | Chrome reference (boxes outside 1 device px) | iOS      | Android  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------- | -------------------------------------------- | -------- | -------- |
| Z1 `z1-sheet-scoped-styles`    | the page's scoped `<style>` on a heading and buttons inside the sheet; a pick lands on the page                                                                                                                                           | absent, fallback shown                 | pass              | page 0 of 14, sheet 0 of 18                  | **pass** | **pass** |
| Z2 `z2-sheet-shared-component` | `lib/Tag.tsrx` with its own scoped style, once on the page and twice in the sheet                                                                                                                                                         | absent, fallback shown                 | pass              | page 0 of 18, sheet 0 of 18                  | **pass** | **pass** |
| Z3 `z3-sheet-size`             | `snapPoints={[0.5, 1]}`: a two-column grid (`calc(50% - 4px)`, `gap`) and a footer pinned by `min-height: 100vh` and `margin-top: auto`, opened at half and pulled to full                                                                | absent, fallback shown                 | pass              | page 0 of 14, half 0 of 28, full 0 of 28     | **pass** | **pass** |
| Z4 `z4-sheet-dark-mode`        | `@media (prefers-color-scheme: dark)`: opened in dark, switched to light and back while open                                                                                                                                              | absent, fallback shown (dark emulated) | pass              | page 0 of 28, sheet 0 of 28 (both bands)     | **pass** | **pass** |
| Z5 `z5-sheet-state-style`      | `.toggle[ui-active]` on a button inside the sheet, following a cell                                                                                                                                                                       | absent, fallback shown                 | pass              | page 0 of 28, sheet 0 of 20 (both values)    | **pass** | **pass** |
| Z6 `z6-sheet-page-selectors`   | the sheet inside `<section class="panel">` inside `<main class="page">`: the content inherits the page's colour and font size, and `.panel .pick` styles a paragraph inside the sheet; the page's padding, border and background stay out | absent, fallback shown                 | pass              | page 0 of 16, sheet 0 of 18                  | **pass** | **pass** |

How each was judged. Texts decide pass or fail on every column. The looks (colours, borders, radii, positions) were read
side by side: phone screenshots against Chrome's rendering of the same document at the same size. Z3 at half height
shows the footer at the bottom of the half-height sheet and, after the pull, at the bottom of the full-height one (iOS
`01-tap-after.png`, `02-swipe-after.png`, the same on Android); the grid's columns fill the sheet's width. Z4's
screenshot after opening in dark shows `#1d1b16` behind light text and a gold border; after the switch to light, while
open, `#fdfcf9` and the slate text. Z5's toggle turns teal with white text when on. The one visible difference from
Chrome is #809's: Dragon draws `sans-serif` as its pinned Inter, which Chrome's reference here also uses.

Two flow changes made the screenshots records rather than snapshots of an animation: after an `appearance` step and
after a `swipe` step, Maestro now waits for animations to end (`waitForAnimationToEnd`); before that, the shot after a
dark switch caught iOS's cross-fade (sheet colour `#6e6c68`, then `#494743`, on the way to `#1d1b16`), and Android's shot
after the pull was taken before the sheet settled. S3 and Y3's flows change with them.

Device receipts: Z6 and the iOS presenter fix in `receipts/2026-11-18-sheet-z6-and-ios-presenter-verdict.txt`
(Z1-Z6, Y1-Y3, both phones); the rest in `receipts/2026-11-18-sheet-styled-content-verdict.txt` (the whole phone ladder, 39 rungs, one run per
platform: "proof passed on iOS and Android"), with the per-platform reports beside it.

### Payload (a component's look stored once)

Bytes of compact JSON, per rung, from `style-size.json`. "Separate" is Dragon's export for the page and for each sheet
height; "app file" is the one style file shipped.

| Rung | Separate                                      | App file | Write lists / node references (each phone) |
| ---- | --------------------------------------------- | -------- | ------------------------------------------ |
| Z1   | page 10,812; sheet 14,148; 24,960             | 20,019   | 11 / 16                                    |
| Z2   | page 13,781; sheet 13,340; 27,121             | 16,896   | 7 / 18                                     |
| Z3   | page 10,763; half 20,525; full 20,527; 51,815 | 26,758   | 10 / 35                                    |
| Z4   | page 20,402; sheet 19,964; 40,366             | 28,332   | 15 / 28                                    |
| Z5   | page 20,028; sheet 15,375; 35,403             | 21,601   | 8 / 24                                     |
| Z6   | page 12,756; sheet 12,587; 25,343             | 19,081   | 10 / 17                                    |

Z2: the Tag's box and text on the page and both Tags in the sheet name the same two write lists (indexes 3 and 4 on
each phone), 1,151 bytes on iOS and 1,168 on Android, carried once instead of three times. Frames stay per document:
Dragon lays a component out where it sits. Z3's two heights share every write list; only frames differ. A page with no
sheet, or an unstyled sheet, carries nothing new: no `sheets` field, no extra Dragon input.

### Found on the way (the merge of #809 into the sheet branch)

- **iOS: the system sheet did not present on tap, on `cw/system-sheet` itself** (reported by the integration run on
  mini-1, #820; reproduced here on 2026-11-18 on a clean checkout of `cw/system-sheet` at `deee0dc85`: Y1 to Y3 fail 0 of 3 at
  the tap, on simulator `markless-sheet-st`, iPhone 17, iOS 27.2, Xcode 27.2 27B52). A code defect, not the machine:
  the receipt for Y1 to Y3 was taken on `9b927e6f0`, where `buildPage()` gave the view tree its presenter; the merge of
  `cw/device-slice` (`0315c68d5`) moved that line into the path that applies a device call's answer, so a tap that opens
  a sheet had no presenter and the sheet waited for a window it already had. This branch sets the presenter when the
  page is built. The UIKit test that covers it already existed and fails without the fix
  (`aSystemSheetKeepsItsContentOffThePageAndPresentsAPageSheet`: "the sheet did not present" on `deee0dc85`, passes on
  this branch). It ran only under `xcodebuild test` on a simulator, which no CI job and no harness step ran, so the
  regression went unseen. Now it runs in both: the `mobile-hosts` workflow (`.github/workflows/mobile-hosts.yml`, every pull
  request that touches the hosts, the vectors or the harness, whatever its base) runs the iOS package's tests on a
  simulator and the Kotlin host's JVM test, through `node src/harness/cli.ts host-tests`; the proof harness runs the same
  tests before any rung and stops when they fail. Evidence: the job on `deee0dc85` (draft #828, run 44280089236)
  fails `ios-host` on that test; on this branch both jobs pass (run 44285417785, after two fixes for CI's older Xcode:
  the iOS 26 content swipe-back is compiled only by Swift 6.2, and `paintSides` runs on the main actor). The Android host has no view-level tests to run (its JVM test
  covers the interpreter core and the style decoder only); its sheet is covered by the rungs on the emulator alone. With the fix, Y1 to Y3 and Z1 to Z6 pass on iOS.
- **Android:** with #809's screen stack beside the sheet branch's `singleTask` shell, every pushed screen reused the first
  (S3 failed on Android at "Open settings"). The shell is back to the standard launch mode, and the test build's device
  links (`markless-proof://device/...`) go to a `DeviceLinkActivity` that sets the value on the screen on top and
  finishes; D1 and N4 pass with it.
- **Android, D7:** with the standard launch mode, Settings opened by `settings.open` stayed on top when the person came
  back to the app, because it had opened inside the app's own task (`singleTask` used to clear it). It now opens in its
  own task (`FLAG_ACTIVITY_NEW_TASK`), as an app's link to Settings does; D7 passes again.
- **Host test fixtures:** a formatter run on this branch rewrote six existing host fixtures that two iOS style-export
  tests edit as text; those tests failed under `swift test` and `xcodebuild test`. The fixtures are restored byte for byte.
- **Not fixed, Dragon:** `color-scheme` that names dark on the root (or on an element whose `color` is initial) is refused
  (`DRAGON_UNSUPPORTED_VALUE`, "which Dragon does not draw yet"): Dragon models no dark Canvas and CanvasText. So a
  styled page or sheet that opts in to a dark canvas is refused by name rather than drawn white.
- **Harness, fixed:** it created a missing simulator on the newest iOS runtime by version, and with
  `iOS-27-2-iPhone19-4` installed beside `iOS-27-2` (both 27.2) it could pick the device-specific one, which refuses an
  iPhone 17 (`Incompatible device`, mini-1). It now picks the newest runtime whose `supportedDeviceTypes` names the device
  type it creates (`simulatorRuntime`, test `harness-simulator-runtime.test.ts`). An existing simulator is reused as before.
- **Android JVM conformance:** six app-style refusal checks had always failed silently (their text edits did not match
  the re-formatted fixture); the edits are now whitespace-tolerant and all pass.

## Y5: a confirmation

Platform guidance: Material keeps confirmations in a centered basic dialog ("urgent information, details, or actions");
Apple uses an alert for critical confirmations and an action sheet / `confirmationDialog` for "choices related to an
action people initiate" (a destructive action the person started). Neither is a sheet holding the app's markup: both
are drawn entirely by the system from a title, a message and labelled buttons. So a confirmation does not belong in
`native.sheet`. The options:

1. **Stay with `modal alert`** (your own control; centered on every platform; works on the web today, stopped on phones
   with `modal`, `cw/native-ui` u4b).
2. **`native.alert`**, the platform's own alert: text-only parts, the system draws everything.

    ```tsrx
    <native.alert open={confirming} onChange={(open) => (confirming = open)}>
    	<native.title>Delete this address?</native.title>
    	<native.message>You cannot undo this.</native.message>
    	<native.action cancel>Cancel</native.action>
    	<native.action destructive onClick={() => (addresses = addresses.filter((a) => a.id !== chosen))}>Delete</native.action>
    </native.alert>
    ```

    iOS `UIAlertController(.alert)` (actions with `.cancel` / `.destructive` styles), Android
    `MaterialAlertDialogBuilder`; absent on the web like every `native.*` element, where the author's guarded `@else` uses
    `modal alert` or `<dialog role="alertdialog">`. Each action's `onClick` is a
    handler like any other (data); children other than these parts with text would be refused.

3. **A call** (`await confirm({ title, actions })` in `@markless/device`): the result arrives by `await`, which a phone
   cannot run as data today (handlers that await are refused); rejected for that reason.

Recommendation: **2 later, 1 now**, because the platforms draw confirmations themselves from text, which makes
`native.alert` the cleanest member of this namespace, and `modal alert` already covers "your own control".

## What else would sit beside the sheet (from the research, single digits)

Each is absent on the web like the sheet (in parentheses: what an author would use in the `@else` arm). Presentations
whose frame is the platform's: `native.alert` (web `<dialog role="alertdialog">`), `native.actions`, an
action sheet / confirmation dialog (web a `<dialog>` with a list of buttons), `native.menu` (UIKit `UIMenu`, Android
`PopupMenu`; web `popover` with a list). Embeddable views the system draws, tag-shaped: `native.map` (MapKit, Google Maps;
web has no built-in map, needs a provider: open question), `native.camera` (preview; web `getUserMedia` into `<video>`),
`native.payButton` (Apple Pay `PKPaymentButton`, Google Pay; web the Payment Request API behind a button),
`native.signInButton` (Sign in with Apple / Google; web the providers' JS buttons or FedCM). Share sheet, photo picker
and notifications are launched, not placed: calls in `@markless/device`, not elements. Date and time pickers are already
HTML (`<input type="date">` shows the native picker on phones).

## Found on the way

Filed: #817 (a page-wide `onIdle` hook starts every client-rendered mount at idle) and #818 (a client-rendered `attach`
whose input reads state never re-runs).

- **Not fixed, `@markless/web`:** a page-wide `onIdle` hook starts every client-rendered mount at idle, including mounts with
  no idle record (above). A fix (wake only a mount holding an idle record) was on this branch and is reverted: it moved a
  helper into a new runtime module, and this PR changes no web runtime.
- **Not fixed, `@markless/web`:** a client-rendered `attach` whose input reads state runs once at mount with `undefined` and
  never again; a fix with a test was on this branch (route such behaviours through the runtime that re-runs them) and is
  removed for the same reason.
- An `attach` factory argument written as an expression (`presentDialog(open === true)`) reaches the behaviour as
  `undefined` on a server-rendered page, with no build error.
- A router page that opens a linked module's `<div overlay>` from its own state does not start the overlay runtime that
  module's mark needs: Escape and an outside press never report `dismiss`.
