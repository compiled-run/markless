# `native.sheet`: the platform's own sheet, as an explicit choice

Branch `cw/system-sheet` (base `cw/native-targets`; the branch keeps its first working name). Owner direction, 2026-11-17: "The consumer should be able to choose
between their own level of control or native." This file is the contract for the second choice. Status: working name,
draft. Name: the planner's ruling from the naming test (`cw/device-api-ab`, `naming/report.md`): `import { native } from '@markless/ui'`, 12 of 12 readers read it correctly; the owner may still overrule it.

## The two choices

| You want | Write | Who draws the frame | Same on every platform? |
|---|---|---|---|
| Your own control: your frame, your motion, your look | `modal`, `drawer` from `@markless/ui`, or a plain `<dialog>` | You (the headless family's markup and your CSS) | Yes |
| The platform's own sheet | `<native.sheet>` from `@markless/ui` | The platform: iOS `UISheetPresentationController`, Android Material `BottomSheetDialog`, web a modal panel on the page's overlay layer | No: each platform's real sheet |

One sentence for an author: **use `drawer` when the sheet must look and move the way your design says on every platform;
use `native.sheet` when it should be the sheet people already know on their phone, with the platform's drag, heights,
dimming, keyboard and back behaviour, and you style only what is inside it.**

## How an author writes it

```tsrx
import { state } from '@markless/core';
import { native } from '@markless/ui';

export default function Checkout() @{
	let picking = state(false);
	let shipTo = state('nowhere yet');
	<main>
		<p>Ship to {shipTo}</p>
		<button onClick={() => (picking = true)}>Choose city</button>
		<native.sheet open={picking} onChange={(open) => (picking = open)} snapPoints={[0.5, 1]}>
			<h2>Choose a city</h2>
			<button onClick={() => { shipTo = 'Osaka'; picking = false; }}>Osaka</button>
		</native.sheet>
	</main>
}
```

- **Open state is the page's own state.** `open={picking}` presents the sheet while it is true; the page's handlers write
  it like any other state, and a value picked inside lands in the page's state directly (no result channel).
- **`onChange(open)`** runs when the platform closes the sheet (a swipe, the back gesture, a tap on the dimmed page,
  Escape on the web), always with `false`. It does not run when the page itself writes `open = false`. It is the same
  word and shape as `drawer`'s and `modal`'s `onChange`; the difference is that a sheet has no trigger part, so opening is
  always the page's own write.
- **The content is ordinary Markless markup**, styled by the author's CSS (through Dragon on phones). **The frame is not
  styleable**: corner radius, grabber, dimming colour, the sheet's background and its motion are the platform's. There is
  no `class` or `style` on `<native.sheet>`; an author who needs to style the frame wants `drawer`.

## Options

Kept to what both phones have. Each must be fixed at build time in this draft (state-driven options are refused by name).

| Option | Default | Meaning | iOS | Android | Web |
|---|---|---|---|---|---|
| `open` | `false` | Shows the sheet while true | present / dismiss | `show()` / `dismiss()` | the backdrop's `hidden` follows it |
| `onChange` | none | The platform closed it | `presentationControllerDidDismiss` | `setOnCancelListener` | the overlay's `dismiss` (Escape, a press outside); stopped, see Rungs |
| `snapPoints` | `[1]` | Resting heights, as fractions of the screen's height: one value, or two with the larger `1` | detents: `1` is `.large()`, `0.5` is `.medium()`, any other a custom detent | `1` alone: expanded, skip collapsed; `[x, 1]`: `halfExpandedRatio = x`, starts half expanded | no meaning: a browser dialog has no resting heights; it is as tall as its content, up to the viewport |
| `dismissible` | `true` | The person can close it the platform's way | `isModalInPresentation = !dismissible` | `setCancelable(dismissible)` (back, outside tap, swipe) | `dismiss` is ignored when false |
| `modal` | `true` | The page behind is dimmed and cannot be reached | `largestUndimmedDetentIdentifier` unset; when `false`, set to the largest detent | `BottomSheetDialog` when true; a standard bottom sheet in the page when false (not built yet, refused on phones) | `aria-modal="true"`, which the overlay layer reads to make the page inert |

`snapPoints` and `modal` are `drawer`'s words for the same ideas (drawer measures fractions of its own size; a system
sheet's are of the screen, because that is what both platforms take). `dismissible` has no headless counterpart: `modal`'s
`alert` blocks outside presses only, and is a different idea (an alert dialog).

Why at most two heights: Android's sheet has exactly one resting height between collapsed and expanded
(`halfExpandedRatio`); a third would exist on iOS only. Why the largest must be `1`: Android's expanded state is the full
height (with `fitToContents` off); an iOS custom detent below full has no Android match.

## What each platform does

| | iOS (UIKit) | Android (Views) | Web |
|---|---|---|---|
| What is presented | A `UIViewController` holding the content's views in a `UIScrollView`, presented with `.pageSheet` | `com.google.android.material.bottomsheet.BottomSheetDialog` holding the content's views in a `NestedScrollView` | a `role="dialog"` `aria-modal` panel inside a `<div overlay>` backdrop, styled like the browser's dialog under `@layer markless` |
| Grabber / drag handle | `prefersGrabberVisible = true` when there are two heights | the Material 3 drag handle view when there are two heights | none |
| Drag between heights, swipe to close | the system's | `BottomSheetBehavior`'s | none |
| Back | no back for a sheet on iOS (VoiceOver's escape gesture is the system's close request) | the system back gesture or button (predictive back from Material) | Escape, and Android Chrome's back through the dialog's close watcher |
| Keyboard | the sheet rises above the keyboard (system) | `adjustResize` on the dialog window; Material insets | the browser's |
| Library | none (UIKit) | Material Components for Android (`com.google.android.material:material`), see the receipt below for what it adds to the app | none |

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

`@markless/ui`, as the namespace `native` beside the headless families (`packages/headless/components/src/native/`).
Readers in the naming test took a package of its own to also hold device calls. The name lives in one place for the
compiler, `PLATFORM_PIECES_PACKAGE` and `PLATFORM_PIECES_NAMESPACE` in `@markless/serializer/native-view`; changing it is
those two constants and the one `export * as native` line in `@markless/ui`'s `src/index.ts`. The compiler recognises the
element from the analyzer's component edge (`importSource`, `importedName`) and the module's import of it, so
`import { native as platformUi }` works too. Two things to know: `packages/headless/components/SPEC.md` lists the
established part names, and `sheet` under a `native` namespace is a planner ruling, not an established role; and spec
`11-platform-organization.md` keeps `native` off package and import names, which this is not (it is an export inside
`@markless/ui`), but a reader of that spec may trip on it.

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
- **Styling content inside the sheet through Dragon**: Dragon lays out one page box tree; the sheet's content is a second
  root, the same open question as `<dialog>` on `cw/native-ui`.

## Why the web is not a `<dialog>`

A modal `<dialog>` opens only through `showModal()`, a call. Markless runs calls on an element only from an `attach`
behaviour, and on a server-rendered page a behaviour starts only after an event on or inside its element, `onVisible` or
`onIdle`. The first version used `onIdle`; because `@markless/ui`'s barrel links every family into a page that imports
it, that cost every such page about 31 KB gzip of runtime at load (docs `/concepts/state`: 124 files and 2,759,153 B
against 119 and 2,728,165 B without it, local builds; perf-guards G16 on CI) and woke unrelated mounts (the slider's
screen-reader lane). The web sheet therefore uses the mechanism `modal` and `drawer` open from state with: a `<div
overlay>` backdrop whose `hidden` follows `open`, holding a `role="dialog"` `aria-modal` panel styled like the browser's
dialog. Measured load cost on the same page: 119 files, 2,728,147 B (none).

## Rungs (2026-11-17)

**Web stopped (Y1, Y4).** A page that opens `<native.sheet>` from its own state does not start the overlay runtime the
sheet's module needs: the overlay mark is in the linked `@markless/ui` module's demand map, the page's click runs on its
lean path, so the overlay never enlists. The sheet opens and closes from state (Y2, Y3 pass), but Escape and a press
outside never report `dismiss` and the page behind is not made inert. `modal` and `drawer` do not hit this because their
own trigger part opens them. The rungs carry `webStopped` and their web check runs as an expected failure that turns red
once it passes. Fix: the page's action whose write reaches a linked module's overlay `hidden` must demand the overlay
runtime (compiler, runtime demand map and linking); not done here.

Columns as in `contract.md` section 5: **Web** is `packages/mobile/test/ladder-web.test.ts` (a real router app in
Chromium; the web's "swipe" and "back" are Escape, its "pull up" does nothing because a browser dialog has no resting
heights); **Reference** is `ladder-native-reference.test.ts` (the real compiler's payload run by the reference runtime
through a mirror host); **iOS** and **Android** are the rung's Maestro flow on the simulator and the emulator. Device
receipt: `receipts/2026-11-17-native-sheet-y1-y3.txt` (one harness run, both platforms: "all 3 rung(s) passed on iOS and
Android"). Screenshots: `packages/mobile/proofs/y<n>-*/screenshots/{ios,android,web}/` (web ones taken at 402×874 by a
one-off Playwright script driving the same steps, not by the test).

| Rung | What | Web | Reference | iOS | Android |
|---|---|---|---|---|---|
| Y1 `y1-sheet-open-close` | open from a button; close by swipe, by back, and by the page's own button; a counter of platform closes on the page | **stopped** (below) | pass | **pass** | **pass** |
| Y2 `y2-sheet-pick` | a list and a text input inside; the pick lands on the page; keyboard up (`keepKeyboard`) while typing | pass | pass | **pass** | **pass** |
| Y3 `y3-sheet-heights` | `snapPoints={[0.5, 1]}`: opens at half, pulled to full, 70 items scrolled to the last | pass | pass | **pass** | **pass** |
| Y4 `y4-sheet-beside-drawer` | the same page with the headless `drawer` | **stopped** (below) | **refused by name** (`<drawer.root>, a component from another module`) | not run | not run |
| Y5 confirmation | report only, below | | | | |

What each rung needed and what is real:

- **Y1.** Payload: the `sheet` node, `dismiss` action, `sheet` journal entry. Real on both phones: the system sheet,
  its pull-down, Android's back *gesture* (a left-edge swipe; gesture navigation is the AVD's default). iOS has no back
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
- **Y4.** On the web both open (the drawer's frame is the author's CSS, the sheet's the browser's dialog look:
  `screenshots/web/01-tap-after.png` and `03-tap-after.png`); closing the native sheet by Escape is the stopped step. On phones
  the compiler refuses it because the headless `drawer` does not build for phones yet (`cw/native-ui`, u4c: its drag is
  pointer handlers, not data). This rung is a failure on phones, not a pass; it turns green when `drawer` lowers.
  The phone side of the pair is Y1's sheet screenshots.

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
   `MaterialAlertDialogBuilder`, web `<dialog role="alertdialog">` opened with `showModal()`. Each action's `onClick` is a
   handler like any other (data); children other than these parts with text would be refused.
3. **A call** (`await confirm({ title, actions })` in `@markless/device`): the result arrives by `await`, which a phone
   cannot run as data today (handlers that await are refused); rejected for that reason.

Recommendation: **2 later, 1 now**, because the platforms draw confirmations themselves from text, which makes
`native.alert` the cleanest member of this namespace, and `modal alert` already covers "your own control".

## What else would sit beside the sheet (from the research, single digits)

Presentations whose frame is the platform's: `native.alert` (web `<dialog role="alertdialog">`), `native.actions`, an
action sheet / confirmation dialog (web a `<dialog>` with a list of buttons), `native.menu` (UIKit `UIMenu`, Android
`PopupMenu`; web `popover` with a list). Embeddable views the system draws, tag-shaped: `native.map` (MapKit, Google Maps;
web has no built-in map, needs a provider: open question), `native.camera` (preview; web `getUserMedia` into `<video>`),
`native.payButton` (Apple Pay `PKPaymentButton`, Google Pay; web the Payment Request API behind a button),
`native.signInButton` (Sign in with Apple / Google; web the providers' JS buttons or FedCM). Share sheet, photo picker
and notifications are launched, not placed: calls in `@markless/device`, not elements. Date and time pickers are already
HTML (`<input type="date">` shows the native picker on phones).

## Found on the way

- **Fixed here, `@markless/web`:** a client-rendered `attach` whose input reads state ran once with `undefined` and never
  again (`attach-state-input.test.ts`); a page-wide `onIdle` hook started every client mount at idle, including mounts with
  no idle record (`on-idle-many.test.ts`).
- An `attach` factory argument written as an expression (`presentDialog(open === true)`) reaches the behaviour as
  `undefined` on a server-rendered page, with no build error. Not fixed.
- A child component may not render live `{children}` inside an `@if` it controls (`MARKLESS_PROJECTION_LIVE_IN_BRANCH`).

## Proposal (owner): a behaviour starts when its inputs change

**What changes.** Today a server-rendered `attach` starts only on an event on or inside its element, `onVisible` or
`onIdle` (spec `04-events-symbols-behaviors.md`, the list after "On a server-rendered host the behavior symbol is imported
only when one of these triggers activates it"). Add one trigger: "a write to state one of its inputs reads". The line
"When behavior inputs change, v1 cleans up the existing behavior and runs it again" would then hold for a behaviour that
has not started yet.

**What it fixes.** Any element whose imperative state follows page state from a server-rendered page, with no load cost:
a `<dialog>` opened by `showModal()` (so `native.sheet` on the web could be the browser's real top-layer dialog), video
`play()`, a chart's redraw. Today each needs `onIdle` (a runtime at load) or an event inside the element.

**What it costs.** The behaviour's symbol and its runtime load on the first write that reaches its inputs, a press-time
cost, not a load-time one. The compiler already routes such a write away from the scalar lean path (runtime demand map,
behaviour `inputGraphReads`), but on the page tried here the press was handled before `resume-behaviors.ts` was
constructed, so the subscription that would start it was never made: the runtime that handles that press must build the
behaviour subscriptions (or the demand map must route the press to the full runtime). Size: one more condition in the demand
map and the start path; the behaviour runtime module (`web/resume-behaviors`) on the press.

**Evidence.** `packages/vitest-browser` server-rendered test (not committed): flipping state from a button outside the
element left a state-reading `attach` unstarted; making `resume-behaviors.ts` start an inactive host on input change was
not enough, because neither `resume-behaviors.ts` nor `event-only-resume.ts` ran for that press (instrumented).
