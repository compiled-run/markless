# Native integration: conformance report, 2026-11-17

Branch `cw/native-integration` (draft PR #820, base `cw/native-targets`) holds today's navigation, styles, device, sheet,
headless-UI, scrolling, forms, element and value branches together. Latest full run (round two, below): 77 of 81 buildable
rungs pass on the iPhone simulator and 80 of 81 on the Android emulator. Rung 17 failed on both and is fixed and proven since;
the 3 iOS failures are the system sheet (Y1 to Y3), fixed on #822, which is not merged yet. The table below is round one's.

| Area | Rungs | iOS | Android | What is missing |
|---|---|---|---|---|
| One-screen basics | 01 to 11 (15) | 14 of 14 | 14 of 14 | Async values: rung 11 is refused (`a @try inside an @if arm, a @for row or another @try`), stopped by owner decision |
| Device | D1 to D7, D4b, P1 (9) | 9 of 9 | 9 of 9 | D7 on Android failed in the full run (only together); fixed and proven since (follow-ups) |
| System sheet | Y1 to Y4 (4) | 0 of 3 | 3 of 3 | iOS: the sheet does not present on tap (also on `cw/system-sheet` today); Y4 refused (the headless drawer beside it) |
| Headless UI | U1 to U6, U11 to U14 (10) | 10 of 10 | 10 of 10 | 43 of 46 families still refused by the probe: dismiss, pointer events, style bindings, more |
| Navigation | N1 to N4 (4) | 4 of 4 | 4 of 4 | A modal-sheet route (N5) not built; state lost when the system kills the app |
| Styled apps | S1 to S5 (5) | 5 of 5 | 5 of 5 | `:active`, `:focus-visible`, `:disabled`, width `@media`, the system font (G1 to G4, G7); Android cuts off some text (already on the branch) |

Counts are rung folders that build for the phones (45 of 47; 11 and Y4 are refused by name). The web column passes all 47.

## 1. Typecheck and fast CI

- `pnpm run typecheck`: passes on the integrated tree.
- `pnpm ci:local --fast`: passes (agent-files, typecheck, typecheck-ts7, unit: 1,007 test files, 8,344 tests passed, 21 expected failures, 34 skipped).
- PR CI on `67f84a28e`: green except **perf-guards G16**: the docs page downloads 1,709,593 B gzip at load, 217 B more than its anchor (1,709,376; 48 B allowed). It passes on #811 alone, so the growth comes from combining the branches (the docs page bundles the compiler, which grows with every native pass). Not accepted: raising the anchor is the owner's call. `unit (1/3)` failed twice on `packages/router/test/vite/first-write-sync.test.ts` (from main's #730, already reported on #736) and passed on a rerun of that job; it passes 3 of 3 locally. The `ios` job failed on the first push (an iOS 26 API in CI's Xcode 16.4) and passes after the fix in section "Added on this branch".

## 2. Conformance vectors

26 vector files (`packages/mobile/conformance/*.json`: 23 one-screen, 3 navigation).

| Runtime | Files reproduced exactly | Mismatches |
|---|---|---|
| Reference runtime (`conformance.test.ts`: every committed file equals a fresh build) | 26 of 26 | none |
| Swift host (`swift test` in `src/adapters/ios`: 23 one-screen cases and 3 app cases) | 26 of 26 | none |
| Kotlin host (`test-jvm.sh`: 500 checks over the 26 files) | 26 of 26 | none |

## 3. The ladder

Two harness runs, because the Android emulator disappeared five rungs into the first (no emulator process left; another
session's emulator was running afterwards): run 1 gives iOS for all 45 and Android for rungs 01 to 04; run 2 is Android alone
over all 45. Both on `markless-integ` (iPhone 17, iOS 27.2) and `markless_integ` (API 36, port 5598), through the heavy
queue, Dragon from a worktree that merges dragoncss #590, #591 and #592. Receipts:
`receipts/2026-11-18-integration-{ios,android}-45-rungs.json` and `receipts/2026-11-18-integration-verdict.txt`. Web:
`ladder-web.test.ts`, 65 of 65 tests over 47 folders. Reference: `ladder-native-reference.test.ts` (45 walked, 2 refused by
name). "On its own branch" is that branch's latest committed phone receipt, and for the 4 failures a rerun today on a clean
checkout of `cw/system-sheet`.

The simulator had to be made by hand: the harness asked for the newly installed `iOS-27-2-iPhone19-4` runtime, which
rejects an iPhone 17 (`Incompatible device`); `markless-integ` was created on `iOS-27-2`.

| Rung | Web | Reference | iOS | Android | On its own branch |
|---|---|---|---|---|---|
| 01-static-text | pass | pass | pass | pass | passes both phones (receipt on `cw/ui-rows`) |
| 02-styles | pass | pass | pass | pass | passes both phones (receipt on `cw/ui-rows`) |
| 03-counter | pass | pass | pass | pass | passes both phones (receipt on `cw/ui-rows`) |
| 04-attributes | pass | pass | pass | pass | passes both phones (receipt on `cw/ui-rows`) |
| 05-if | pass | pass | pass | pass | passes both phones (receipt on `cw/ui-rows`) |
| 05b-choices | pass | pass | pass | pass | passes both phones (receipt on `cw/ui-rows`) |
| 06-keyed-for | pass | pass | pass | pass | passes both phones (receipt on `cw/ui-rows`) |
| 07-child-component | pass | pass | pass | pass | passes both phones (receipt on `cw/ui-rows`) |
| 07b-imported-component | pass | pass | pass | pass | passes both phones (receipt on `cw/ui-rows`) |
| 07c-child-state | pass | pass | pass | pass | passes both phones (receipt on `cw/ui-rows`) |
| 07d-children | pass | pass | pass | pass | passes both phones (receipt on `cw/ui-rows`) |
| 08-text-input | pass | pass | pass | pass | passes both phones (receipt on `cw/ui-rows`) |
| 09-storage | pass | pass | pass | pass | passes both phones (receipt on `cw/ui-rows`) |
| 10-url-route | pass | pass | pass | pass | passes both phones (receipt on `cw/ui-rows`) |
| 11-async | pass | refused by name | refused | refused | refused there too |
| d1-network | pass | pass | pass | pass | passes both phones (receipt on `cw/system-sheet`) |
| d2-haptics | pass | pass | pass | pass | passes both phones (receipt on `cw/system-sheet`) |
| d3-location | pass | pass | pass | pass | passes both phones (receipt on `cw/system-sheet`) |
| d4-camera | pass | pass | pass | pass | passes both phones (receipt on `cw/system-sheet`) |
| d4b-photo-refused | pass | pass | pass | pass | passes both phones (receipt on `cw/system-sheet`) |
| d5-recorder | pass | pass | pass | pass | passes both phones (receipt on `cw/system-sheet`) |
| d6-sharesheet | pass | pass | pass | pass | passes both phones (receipt on `cw/system-sheet`) |
| d7-settings | pass | pass | pass | **fail** step 3 (settings): Assertion is false: "Access granted" is visible | only together: passes on `cw/system-sheet` tip (rerun today); fixed since, passes with N1 to N4 and D1 (follow-ups) |
| p1-platform | pass | pass | pass | pass | passes both phones (receipt on `cw/system-sheet`) |
| u1-base | pass | pass | pass | pass | passes both phones (receipt on `cw/ui-rows`) |
| u2-collapsible | pass | pass | pass | pass | passes both phones (receipt on `cw/ui-rows`) |
| u3-tabs | pass | pass | pass | pass | passes both phones (receipt on `cw/ui-rows`) |
| u4-dialog | pass | pass | pass | pass | passes both phones (receipt on `cw/ui-rows`) |
| u5-toggle | pass | pass | pass | pass | passes both phones (receipt on `cw/ui-rows`) |
| u6-base-rows | pass | pass | pass | pass | passes both phones (receipt on `cw/ui-rows`) |
| u11-pagination | pass | pass | pass | pass | passes both phones (receipt on `cw/ui-next-blockers`) |
| u12-buttongroup | pass | pass | pass | pass | passes both phones (receipt on `cw/ui-next-blockers`) |
| u13-accordion | pass | pass | pass | pass | passes both phones (receipt on `cw/ui-next-blockers`) |
| u14-gridlist | pass | pass | pass | pass | passes both phones (receipt on `cw/ui-next-blockers`) |
| y1-sheet-open-close | pass | pass | **fail** step 1 (tap): Assertion is false: "Filters" is visible | pass | also fails on `cw/system-sheet` tip (rerun today) |
| y2-sheet-pick | pass | pass | **fail** step 1 (tap): Assertion is false: "Choose a city" is visible | pass | also fails on `cw/system-sheet` tip (rerun today) |
| y3-sheet-heights | pass | pass | **fail** step 1 (tap): Assertion is false: "All items" is visible | pass | also fails on `cw/system-sheet` tip (rerun today) |
| y4-sheet-beside-drawer | pass | refused by name | refused | refused | refused there too |
| n1-two-routes | pass | pass | pass | pass | passes both phones (receipt on `cw/native-style-gaps`) |
| n2-orders | pass | pass | pass | pass | passes both phones (receipt on `cw/native-style-gaps`) |
| n3-navigate | pass | pass | pass | pass | passes both phones (receipt on `cw/native-style-gaps`) |
| n4-deep-link | pass | pass | pass | pass | passes both phones (receipt on `cw/native-style-gaps`) |
| s1-page-styles | pass | pass | pass | pass | passes both phones (receipt on `cw/native-style-gaps`) |
| s2-shared-component | pass | pass | pass | pass | passes both phones (receipt on `cw/native-style-gaps`) |
| s3-state-styles | pass | pass | pass | pass | passes both phones (receipt on `cw/native-style-gaps`) |
| s4-global-tokens | pass | pass | pass | pass | passes both phones (receipt on `cw/native-style-gaps`) |
| s5-page-canvas | pass | pass | pass | pass | passes both phones (receipt on `cw/native-style-gaps`) |

Why Y1 to Y3 fail on iOS: their only phone receipt (about 19:50) predates later commits on that branch (the
`<native.sheet>` commit at 19:57, `native` moving into `@markless/device` at 21:19 and 21:28); rerun today on that branch's tip,
the sheet does not present either. The iOS sheet code here is identical to the branch's.

## 4. Family probe

`node packages/mobile/proofs/ui-family-probe.ts` over 46 `@markless/ui` families: 3 build (collapsible, gridlist, tabs), 43
refused. Against `cw/ui-next-blockers`' committed probe, 5 families differ: `base` builds there and not here (the device
chain added `base.camera`, which the synthetic probe app renders without the `el={…}` it needs; only together), and `ink`,
`select`, `taglist`, `tokenbox` give different refusal reasons (#813's `@for` changes; `select`'s refusal on #816 was
recorded before its own later change). Top refusal reasons, by number of refused families:

| Families | Refusal |
|---|---|
| 21 | `markup outside the root template, its @if arms and its @for rows` |
| 13 | `the dismiss event has no native meaning yet` |
| 11 | `the pointerdown event has no native meaning yet` |
| 10 | `the pointerup event has no native meaning yet` |
| 10 | `a style binding` |
| 9 | `the pointermove event has no native meaning yet` |
| 8 | `the @if test reads the callback `children` as a value` |
| 8 | `the pointerover event has no native meaning yet` |
| 7 | `the <output> element` |
| 7 | `the pointercancel event has no native meaning yet` |

## 5. Web byte-identity

Every `.tsrx` file the two trees share (3,419) compiled through the web pipeline (`compileTsrxModule`, no native facts) on
this branch and on `710c44d48`, the `main` commit the native work branches from; a SHA-256 over each module's render module,
payload scripts, protocol payloads and render plan. 3,418 identical, 1 fails to parse identically on both (`Expected '>' to
close a type assertion`), 0 differ. The bundler's own committed-output fixtures pass in the unit suite.

## 6. What an app author cannot do on phones yet

Names in backticks are the build's refusal messages (`MARKLESS_NATIVE_UNSUPPORTED` unless said).

**Events.** Pointer events (`the pointerdown event has no native meaning yet`, likewise pointerup, pointermove, pointerover,
pointerout, pointercancel); keyboard events (`the keydown event has no native meaning yet`; focusin/keydown handlers are left
out with `MARKLESS_NATIVE_KEYBOARD_ONLY`); `blur`; reading a click event's fields other than the modifier keys
(`reads event.clientX, which a tap on a phone does not have`); an `await` inside an `if` in a handler (new on this branch:
`awaits inside an if`); `focus()` or `scrollIntoView()` options other than `preventScroll`.

**Styles.** A `style={…}` binding (`a style binding`); `:active`, `:focus-visible` and `:disabled` (styles contract G1 to G3,
not built); the system font for `sans-serif` (G4); a width `@media` variant (G7); styles on rows (the style input has no rows);
an unstyled `<Link>` inside a styled page. An unstyled page gets no browser default styles on either phone (see the contact
sheet). Android cuts off the end of some labels (rung 2, S2; already on `cw/native-style-gaps`).

**Overlays.** `dismiss` (`the dismiss event has no native meaning yet`, 13 families; `cw/ui-overlay` pending); a non-modal
`<dialog open>`; popover (u15, stopped on dismiss); a drawer (`shared state \`drawer\` of drawerState needs a JSON initial
value known at build time`, Y4); `<native.sheet>` with `modal={false}`, inside `@if` or `@for`, or with state-driven options;
styled sheet content (`cw/sheet-styled-content` pending). The iOS system sheet does not present today (Y1 to Y3).

**Scrolling.** No page scrolls on either phone; `scrollIntoView` and focus scrolling do nothing yet (`cw/native-scroll`
pending).

**Navigation.** A modal-sheet route (N5, owner decision); saving screens across process death; a `<Link>` whose href or
class is not fixed at build time (`a <Link> whose href or class is not fixed at build time, ...`); on Android, coming back from
a system screen opened in the app's task (D7, this branch only).

**Async values.** `@try` inside an `@if` arm, a `@for` row or another `@try` (rung 11); an async computed whose body is more
than one device call (`whose body is not one device call; it needs a script engine`); more than one device value per `@try`.

**Device features.** Only the calls and values in `@markless/device`'s native table (haptics, network, location, camera,
recorder, share sheet, Settings); `sharesheet.open` cannot say whether something was shared; components such as `<output>`,
property bindings like `checked`, markup outside a component's template (`markup outside the root template, its @if arms and
its @for rows`, 21 families) and `children` read as a value (8 families) block most remaining UI families.

## Findings beside the conformance

- `ladder-native-reference.test.ts` accepted any numbered rung that was refused by name, so a rung that lowers on its own
  branch could start being refused and the test would still pass (it hid a stale local install under which all ten UI rungs
  looked refused). Closed on this branch: see the follow-ups.
- The harness picks the newest iOS runtime; a device-specific runtime (`iOS-27-2-iPhone19-4`) breaks simulator creation.

## Decisions taken without the owner (all reversible)

- Each branch chain was merged at its tip, not commit by commit (one resolution per conflict).
- The run's 682 changed proof screenshots (59 MB) were not committed; the branches' own screenshots stay, and this run's
  launch screens are in the contact sheet (downscaled) and its results in the receipts. The style files the run rewrote
  (rung 4's style input, S1 to S5's `style-size.json`) are committed, as their tools wrote them.
- The contact sheet compares the launch screen (step 0) of every rung; the web column is Chromium at the iOS proof device's
  size for every rung, captured with the web ladder's own build path.
- Everything under "Resolved: one implementation kept" below.

## Follow-ups (2026-11-18)

**Android: deep links and the return from Settings together.** The launch mode stays standard (one activity per screen, as
navigation's back stack needs; deep links open with `markless-proof://app/<path>`). Instead, the Android host opens Settings
with `FLAG_ACTIVITY_NEW_TASK` (`view/Device.kt`, `settings.open`), so Settings lives in its own task and relaunching the app
shows the app, which is what `singleTask` gave the device branch. Proven in one harness run on `markless_integ`: N1, N2, N3,
N4, D1 (a device link into the running page) and D7 all pass on Android
(`receipts/2026-11-18-integration-android-n1-n4-d1-d7-settings-task.json`). iOS is unchanged.
For the owners: **device** (#794, #808, #814): drop `android:launchMode="singleTask"` and open Settings in its own task, as
here. **Navigation** (#800): no change needed; its standard launch mode is kept.

**Reference ladder: a silent refusal now fails.** `ladder-native-reference.test.ts` keeps an explicit list of the one-screen
rungs a native build refuses (`REFUSED_RUNGS`: `11-async`, `y4-sheet-beside-drawer`). Every other rung must lower on both
targets, and a listed rung that starts lowering fails too, so the list stays exact. Checked both ways: with `11-async` dropped
from the list and `u1-base` added to it, those four tests (two rungs, two targets) fail; restored, 85 of 85 pass.

**Left as they are:** perf-guards G16 stays failing (+217 B gzip on the docs page, only together); its size record is not
accepted. The iOS sheet failure (Y1 to Y3) is being investigated on `cw/sheet-styled-content`; nothing here changed for it.

## Native code in the docs' in-browser compiler (2026-11-18)

The docs page downloads the playground's compile worker at load, which bundles the compiler. Read from Rolldown's own
module graph of that worker (built with the site's swaps; `website/tooling/compile-worker-graph.ts`), six native-only modules
were in it: `compiler/src/passes/semantic-graph/expression-tree.ts`, `compiler/src/passes/native-view.ts`,
`compiler/src/passes/semantic-graph/device-target.ts` (all three through `export`s in the compiler's main entry,
`compiler/src/index.ts`), `compiler/src/passes/semantic-graph/web-device-edits.ts` (imported by `compile-module.ts`), and
behind them `serializer/src/native-view.ts` and `serializer/src/native-device.ts`.

Fixed at the source:
- Native builds get their own entry, `@markless/compiler/native` (`NATIVE_FACT_COLLECTORS`, `DEVICE_TARGET_FACTS`,
  `createNativeViewPayload` and the native diagnostics). The main entry no longer exports them; `@markless/mobile` and the
  bundler's build plugin (`rolldown.ts`, never in the worker) import the native entry. These exports exist only on the native
  branches, so `main`'s public API does not change.
- `applyWebDeviceEdits` and the device-object write test are part of the injected device analysis; module functions, a
  computed's tree, `@if`/`@switch` arm tests and callback parameter names are built by the injected native collectors.
- Static texts and attributes in markup chunks are recorded only for native builds, so web compiles neither collect nor strip
  them (`render-data` is back to `main`'s code).
- Test: `website/tooling/compile-worker-graph.test.ts` (website tooling job) fails when the compiler's main entry reaches the
  native entry's modules, or the compile worker's graph reaches a native-only module (what the native entry's modules load
  that the main entry does not, and the `@markless/mobile` package). Checked both ways by putting the leak back (a re-export in
  the main entry; an import of the native entry from bundler code): it fails each time.
- Web output: byte-identical to `main` at `710c44d48` for all 3,419 shared `.tsrx` files, again.

| Figure | Before | After | `main` |
|---|---|---|---|
| Compile worker, built locally (raw / gzip -9) | 3,626,958 / 1,045,540 B | 3,625,686 / 1,045,113 B | 3,622,034 / 1,043,908 B |
| CI G16, docs `/` (gzip at load, 68 files) | 1,709,593 B (failed) | 1,709,168 B (passes) | 1,708,562 B |

`main`'s docs figure is its anchor without the two records the native branches accepted for this cost
(`scripts/benchmarks/anchor-changes/cw-native-targets.json` +584 B, `cw-device-slice.json` +230 B; CI's anchor 1,709,376 B
includes them). So the docs page is still **606 B gzip over `main`**: what remains is no native module but the analyzer's hook
call sites (about two dozen one-line `state.nativeFacts?.…` and `state.deviceTarget?.…` calls and the option plumbing that
carries them, about 5 KB minified before this change and 3.6 KB after), which every web compile runs and finds empty.
Removing those too needs a choice the owner should make: either a `browser` export condition on one compiler module that
holds every hook (the browser compiler gets no-op hooks), or a separate native walk over the analysis (the hooks leave the
shared analyzer). The two records are left as they are until then; with them removed, G16 would fail by those 606 B.
`base.camera` (the device's `@markless/ui` part, 559 B rendered) also ships in the worker's UI sources; not compiler code.

## Round two (2026-11-18): scrolling, forms, real elements, real values

Merged, each with a merge commit on this branch: `cw/native-scroll` (#821, `235daa389`), `cw/native-forms` (#823,
`5d41b7b99`), `cw/real-elements` (#826, `f0bc4dcc9`), `cw/real-values` (#825, `753a0ddc7`). Each was green except the docs
size check. Not merged: `cw/sheet-styled-content` (#822, its CI is still red: the iOS host did not compile on one head, a unit
shard fails on the latest) and `cw/ui-overlay` (#819, see "Left out").

**Ladder, one run over every rung that builds** (81 folders; `11-async` and `y4-sheet-beside-drawer` are refused by name, as
before): iOS 77 of 81, Android 80 of 81. Dragon from my Dragon worktree, which now also merges dragoncss#593 (the scroll
branch's Dragon side). Receipts: `receipts/2026-11-18-integration-round2-{ios,android}-81-rungs.json` and `-verdict.txt`.

| Failed | Phones | Why | Now |
|---|---|---|---|
| 17-into-view | iOS and Android | Only together. Neither host routed an element command (`scrollIntoView()`, `focus()`) to the scroll branch's Chrome-style alignment; they scrolled the least distance, so the target ended at the bottom. #821 proved rung 17 only on a local merge with #816 whose wiring was not pushed. | Fixed (`65f70b4a1`): `scrollIntoView()` aligns to the start, `focus()` brings the element into view unless `preventScroll`, a blocked submit's field scrolls as `focus()` does. Rerun of 16, 17, F1 to F7 and U11 to U14: all 13 pass on both phones (`receipts/2026-11-18-integration-round2-*-focus-scroll-13-rungs.json`). |
| Y1, Y2, Y3 | iOS | The iOS system sheet does not present (fixed on #822, not merged yet). | Waits for #822. |

All other rungs pass on both phones, the new ones included: 12 to 16 (scrolling), F1 to F7 (forms), R101 to R115 (elements)
and R131 to R138 (values). Reference ladder and web ladder: pass (`vitest`, 453 files, 4,036 tests).
Conformance vectors: reference, Swift (31 tests) and Kotlin (632 checks) reproduce every file. PR CI on `65f70b4a1`: green,
including perf-guards and the iOS job (its first try timed out starting Maestro's iOS driver on the runner, before any
rung ran; the rerun passed).

**Docs page size (G16).** Passes: 1,709,267 B gzip at load against the anchor 1,709,376 B, so 705 B over `main` (606 B
before this round; the 99 B are analyzer hook call sites, not native modules). The compile-worker test still finds no
native-only module in the docs' compiler.

### Decisions in this round (all reversible)

| What | Kept | Left | Why |
|---|---|---|---|
| Runtime shape for forms (TS, Swift, Kotlin) | the device branch's `run` and `change` | forms' `step` with an inner `run` | Forms' `submit`, `tick` and `after` ops, the `timer` event, edited-field tracking, checks and busy marks moved into the kept shape. Timer and invalid entries are journalled in op order, as the reference runtime does. |
| `await` in a handler | a device call: a continuation; anything else: forms' timer `after` | device's refusal of other awaits | Both readings fit one statement kind (`await`). |
| `new` in the analyzer | `new Date(...)` stays the call real-values answers by name | — | Both branches handled `new`; real-values' case came first and hid forms' `new FormData`, `new Error`, `new Promise`. Now `new Date` is a call and every other `new` is forms' node. |
| Exports for native refusals (#826) | `@markless/compiler/native` | the main `@markless/compiler` entry | A main-entry export would put native code back in the docs' compiler. |
| Module constants (#825) | collected by the injected native collectors, like module functions | collected in the shared analyzer | Same reason: the main entry gains no native-only code. |
| Allowed elements | real-elements' `NATIVE_ELEMENTS`, with `form` added | forms' `PORTABLE_ELEMENTS` | One list; `form` is the forms branch's entry in it. |
| Keyboard steps in the ladder (#821) | `keepKeyboard` | `keyboard: 'stays'` | Same meaning; one spelling. Swipes take `up` or `{ from, to, until }`. |
| Dragon data-only compile (dragoncss#593 with #590) | appearance bands on both compiles | bands only on the full compile | Markless uses the data-only compile; without bands, dark mode would lose its styles. |
| iOS svg drawing (#826) | `viewBox` converted to `CGFloat` before it scales the bounds | `CGFloat / Double` | CI's Xcode 16.4 rejects the mixed division (`ambiguous use of operator '/'`); local Swift accepted it. |
| Style sizes S1 to S5 | as the harness wrote them (+102 B per page) | — | Dragon #593 adds the page's scroll range to every export. |
| Proof screenshots | the branches' own | this run's 1,000+ changed images | As in round one: results are in the receipts. |

## 7. Contact sheet

`docs/goals/native-targets-api/contact-sheet/index.html`: every rung at its launch screen, web (Chromium at 402×778, 3×) beside
iOS and Android, with the visible differences listed at the top.


## Conflicts

Each chain was merged at its tip (the tip carries its parents' commits), in the order nav and styles, device, headless UI,
UI rows. Every resolution below is in a merge commit on `cw/native-integration`; nothing was pushed to the source branches.

### Resolved: both sides kept, side by side

- **Ladder types and Maestro flows** (`proofs/ladder.ts`): nav's back, appearance, title, deep link and `onWeb` beside device's
  permissions, prompts, system screens, sheets, scroll and device links. Nav's 400 ms edge swipe (Back) and the sheet's
  300 ms back gesture are kept as two constants, so every committed `flow.yaml` stays what its own branch generated (the
  flow test regenerates all 47 and compares).
- **Payload and journal types** (`serializer/native-view.ts`, `Payload.swift`, `Payload.kt`, `Runtime.*`): navigate with
  evaluated params and `replace`, `title`, device `call` with continuations, `sheet`, `release`, `if`, `dialog`,
  `command`, row cells (`row`), the `dismiss` and `cancel` events.
- **Reference runtime, Swift and Kotlin runtimes**: device's split into `run` and `change` kept; nav's evaluated link
  params and title journal, #816's `if`, `dialog` and `command` ops, and #813's row slots folded into it.
- **iOS and Android hosts**: device objects and sheets beside nav's navigation stack, title and appearance; the device is
  passed through `MarklessRoot` and `MarklessNavigationController` to every screen.
- **Rung folders and numbering**: no folder collides. The ordering test lists all 37 numbered and named rungs in folder
  order.
- **Generated files** regenerated with their tools: `errors-index.ts` (`node website/tooling/errors.ts`),
  `ui-family-probe.json` (the probe), style inputs and `style-size.json` (written by the harness run).

### Resolved: one implementation kept, the other needs its owner

| What | Kept | Left | Why |
|---|---|---|---|
| Handler statements in the analyzer: `obj.field = v`, `obj.method()`, calls by name | #816's shapes (`assign`/`invoke` with a member `path`, `method`, `apply` for module helpers) | device's `assign-field`, `effect` of a call, `call.calleePath` | One syntax needs one shape. #816's is the general one; device's readings are re-expressed over it in the native-view pass (a method call on a `@markless/device` import or a device object is a device call; a one-field write to a device object is a setting). Device's `await` node and `effect` for awaited statements are kept: #816 has neither. **Device owner to review `native-view.ts` `methodCallSite`, `isDeviceCallSite` and the device branch of `statementOps`.** |
| Handler lowering | #816's `lowerStatements` (with `if`, `const`, `return`, kept values) and its late lowering of handlers | device's `statementOps` loop | Device's await continuations moved into `lowerStatements`. New limit: an `await` inside an `if` branch is refused by name (device had no `if`). Handlers inside a `@try` arm lower when their arm does (the `@catch` arm needs to know whether a handler writes its error); elsewhere they lower after the tree, as #816 does. |
| Values bound to a callback's parameters | #816's `args` | device's `bound` | Same capability. The sheet's `onChange(false)` now binds through `args`. |
| Which component module an import names | #816's `modules` (analysis by filename, package specifiers resolved) | nav's and device's `importedModules` (by relative specifier) | #816's covers `@markless/ui` packages; nav's imported-module style collection is kept beside it in `compile.ts`. |
| Which bound attributes reach Dragon per state | #816's `isNativeStyleStateAttribute` (`ui-*`, `aria-*`, `data-*`, `hidden`, `role`; only written true/false cells add assignments) | #811's `nativeStyleAttribute` (`class` and `ui-*`) | #816's is the wider rule. Visible effect: rung 4's style input now carries `aria-label` and `aria-pressed` by state, and S1 to S5's style sizes move by 1 to 2 bytes (Dragon side, below). |
| A row instance's handler (`<node>@<key>`) | #813's instance scope (row item and row state) | #800's `scopeOf` (row item only) | Same id format; #813's also reaches row state. Removed nav's `scopeOf` in TS, Swift and Kotlin. |
| Android launch mode | standard (nav: one activity per screen of the stack) | device's `singleTask` | `singleTask` allows one activity per task, which breaks nav's back stack. Measured consequence in the full run: D7 failed on Android, only together (after granting location in Settings, relaunching the app leaves Settings on top, because Settings opened inside the app's task and only `singleTask` cleared it); D1's device link still works. Resolved since: Settings opens in its own task (follow-ups). Nav's deep-link reader now ignores links whose host is not `app`. |
| Link schemes | one scheme (`PROOF_LINK_SCHEME = PROOF_URL_SCHEME`, both `markless-proof`) | a second constant with the same value | The iOS shell routes host `device` to the test device and anything else to the app stack. |
| Reference test for a refused rung | every error is `MARKLESS_NATIVE_UNSUPPORTED`, every warning `MARKLESS_NATIVE_KEYBOARD_ONLY`, at least one error | every diagnostic `MARKLESS_NATIVE_UNSUPPORTED` | #816 added a keyboard-only warning; y4, refused on its own branch, now also carries two of them. |
| Dragon: Markless node ids | #590's reversible encoding (`treeId`/`marklessId`) | #592's `m<k>` renaming (`dragonElementIds`) | Same capability; #590's hidden-node handling depends on its encoding. #592's page canvas is kept. |
| Dragon: attributes by state | #590's per-combination check and compile | #592's grouped conditions | Same capability, same input format. |

### Added on this branch (small, reversible, recorded)

- iOS host: `interactiveContentPopGestureRecognizer` (iOS 26 SDK, from #800) is compiled only with Swift 6.2 or later, so the
  host builds on CI's Xcode 16.4. The `ios` CI job does not run on the source PRs, so this never compiled there.
- No public API changed.

### Left out

- `cw/native-handlers` (#807): 19 conflicting files (`native-view.ts`, `expression-tree.ts`, `artifacts.ts`, both hosts'
  runtimes and payload decoders, the harness). Study branch; not merged.
- `cw/sheet-styled-content` (#822): not merged; its CI is red (see round two). Y1 to Y3 on iOS wait for it.
- `cw/ui-overlay` (#819): not merged, although its CI is green. It branched before #816 and implements the same things
  differently: it calls any named helper as `call` and inlines it, where #816 (on this branch) has `apply` plus the collected
  module functions that #825 extends; it whitelists `METHODS`, where #816 lowers method calls as `invoke`. Its element values,
  `contains`, `activeElement`, `instanceof`, pointer events and the overlay stack would have to be rebuilt on #816's shapes
  across the analyzer, three runtimes and both hosts (about 130 conflicting hunks), which is a port, not a merge.
  **Overlay owner:** rebase `cw/ui-overlay` onto `cw/native-integration` (or #816). Also, its size record
  (`scripts/benchmarks/anchor-changes/cw-ui-overlay.json`) accepts +611 B on the docs pages for the compile worker; with
  the native entry, that growth should not be needed, so that entry should go when it is rebased (its web runtime
  entries, +144 B for the overlay install fix, are a real web change).

## Round three (2026-11-18): the overlay port

Branch `cw/overlay-port` (draft PR, base `cw/native-integration`) rebuilds #819's overlay behaviour (modal and popover on
phones) on this branch's #816 shapes instead of merging it. #819 stays open and is superseded.

**What changed in the port, compared with #819:**

- Helpers: a module function is evaluated for its value through `apply` (as before); a handler statement that calls one
  for its effects runs its body as ops through `invoke`; the analyzer keeps that body as `effects` beside the value form.
  #819's `call`-and-inline and its `METHODS` whitelist are gone.
- Elements: handles stay build-time values (#816); where one meets a run-time element (`event.target` of a pointer
  event, `pressTarget`, `document.activeElement`, the focus origin) it is written as its node id.
- Focus: #819's `focus` op and `focus` journal entry are folded into #816's `command`, whose `node` may now be an
  expression. The overlay and popover vectors match #819's journals at every step (15 and 13), with focus as `command`.
- Module set: the analyzer's module-constant facts keep an empty `new Set()`/`new WeakSet()` though its methods write it;
  #819's separate `sets` collection is not needed.
- Ladder: #819's `back: true` (Escape) is `escape: true`, because this branch's `back` is navigation.
- Docs size: #819's record of +611 B on the docs pages is dropped; all new compiler code is behind the native entry and the
  injected collectors (`website/tooling/compile-worker-graph.test.ts` passes). The web fix's resume-runtime entries
  (+144 B rendered) are kept.

**Ladder** (83 folders: round two's 81 plus u20 and u21; `11-async` and `y4` refused by name as before), simulator
`markless-overlay-port` (iPhone 17, iOS 27.2), AVD `markless_overlay_port` (port 5612), Dragon at `e3a0bde12b` (round
two's merge of dragoncss#590 to #593):

| Phone | Before (round two, `cw/native-integration`) | After (this branch) |
|---|---|---|
| iOS | 77 of 81 (rung 17 since fixed: 78) | 80 of 83: Y1 to Y3 fail as before (wait for #822); u20, u21 pass |
| Android | 80 of 81 (rung 17 since fixed: 81) | 79 of 83 in the full run; the 4 failures (f3, r136, y1, s4) failed at launch or in Maestro before any step, and all 4 pass on a rerun: 83 of 83 |

Receipts: `receipts/2026-11-18-overlay-port-{ios,android}-83-rungs.json`, `-android-rerun-4-rungs.json`, `-verdict.txt`.

**Vectors:** 31 one-screen and 3 navigation files (overlay.json and popover.json new). Reference: every file equals a
fresh build. Swift: 32 tests pass. Kotlin JVM: 684 of 684 checks over 35 files (the vectors and the scroll vectors).

**Family probe:** 5 of 46 families built before, 7 after (modal, popover); none moved back.
