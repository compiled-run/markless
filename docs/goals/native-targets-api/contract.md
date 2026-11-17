# Native targets: the contract (iOS and Android beside web)

Owner of this file: the lead on `cw/native-targets`. Every other native worker learns the contract from here; when it changes,
this file changes in the same push. Status as of 2026-11-16, night one.

## 1. What I found before building (the owner's picture is weeks old)

- **`docs/goals/native-targets-api/` was not in the repo.** The research board lives only on the planner's machine (copy read
  from `~/native-goal-notes/`, not committed). This folder now holds only the new notes.
- **Earlier proofs:** `poc/fixtures/proofs/ios-native-rendering-target` and `macos-native-rendering-target` are hand-written
  `artifact.json` files driving UIKit/AppKit views, with the click handler run as JavaScript in JavaScriptCore. The compiler
  never wrote those artifacts; no styling, no Android.
- **The compiler already knows most of what a native host needs** (semantic graph, `packages/compiler/src/passes/semantic-graph`):
  element ids and tags, events per element, state cells with build-time initial values, state writes with their operation
  (`count++` is recorded as an `update` with `++`), and text bindings (`"Count " + count`). What it did *not* record as
  structured facts: static text (it existed only inside the HTML strings) and whether a handler does anything besides its
  writes. Nesting is recorded as child-index paths. Both missing facts are now added (section 4).
- **Dragon is further along than the brief assumed.** It already has an Android Views (Kotlin) emitter beside UIKit (Swift),
  Android device lanes on the emulator (several pass, pixel lanes still fail), and builds its Android app from the SDK tools
  alone (no Gradle). Its native output is still `analysis-only` (internal), and it warns that a `<button>`'s activation and
  accessibility role are the app's job: exactly the split below (Markless owns behaviour, Dragon owns paint and layout).
- **Repo vs brief contradictions:** the September report recommended Taffy as the layout library and a package *inside*
  Markless; the owner since chose Dragon as its own project with its own layout engine (Dragon's `docs/decisions.md`). The
  report proposes a `target.os` constant for platform differences; the owner rulings call that *unsettled* (only `@web/@native`
  arms are rejected). It is listed as an open question, not built.
- **Tooling on mini-2:** Java 21 and the Android command-line tools were already present; installed platform-tools, emulator,
  build-tools 36.0.0, platform android-36, the `android-36 google_apis arm64-v8a` image, AVD `markless_native` (Pixel 7),
  `kotlinc` 2.4.21 and the Maestro CLI 2.12.1. The emulator boots headless in 19 s and `adb exec-out screencap` works.

## 2. Packages and folders

Spec `specs/framework/11-platform-organization.md` is the authority: no package named `native`; mobile platforms live in one
`packages/mobile` with OS adapter folders, not a package per OS.

| Where | Owns | Owner |
|---|---|---|
| `packages/serializer/src/native-view.ts` | The payload type (`NativeViewPayload`, `NATIVE_VIEW_VERSION`), ops and journal entry types. Protocol types live with the serializer, as for web. | lead |
| `packages/compiler/src/passes/native-view.ts` | `createNativeViewPayload(semanticGraph)`: the pass that emits the payload from analyzer facts, plus its refusal diagnostics. Not in the web pass pipeline, so web output is byte-identical. | lead |
| `packages/mobile/src/` (TypeScript) | Target-neutral mobile code: `compileNativeComponent()` (compiler front door for a native build), the **reference runtime** (`runtime.ts`: runs ops, produces journal entries) and the **conformance vectors** both hosts must reproduce. | lead (runtime, vectors); harness worker (CLI) |
| `packages/mobile/src/adapters/ios/` | Swift package `MarklessMobile` (UIKit host runtime: payload decoder, view factory, op interpreter, journal applier) and the iOS app shell. Built with `swiftc`/`xcrun`, no Xcode project required. | native-ios-host |
| `packages/mobile/src/adapters/android/` | Kotlin host runtime (`dev.markless.mobile`: same four parts on Android Views) and the APK shell, built from SDK tools alone (aapt2, kotlinc, d8, zipalign, apksigner), as Dragon does. | native-android-host |
| `packages/mobile/proofs/<nn>-<name>/` | One ladder rung: `App.tsrx`, `flow.yaml` (one Maestro flow run on both platforms), `expected.json` (the visible texts before and after each step, checked against the web build), screenshots under `screenshots/{ios,android,web}/`. | native-ladder (component + web check), native-proof-harness (flows, shells, screenshots, CI placement) |
| Dragon repo `examples/markless-counter/` (branch `cw/native-targets`) | Component CSS to native paint and frames as data, plus the Chrome comparison. | native-dragon-styles |

Shared vs per platform: the payload, the op semantics, the journal semantics and the conformance vectors are written once
(TypeScript). Each host *implements* them in its own language because the ruling is no JS engine for op-encoded handlers; the
vectors are how the two implementations are held to one meaning. Element-to-view mapping, event mapping, fonts, safe areas
and accessibility wiring are per platform.

## 3. Rulings this contract follows

Retained platform views changed only by journal entries (no SwiftUI, no custom drawing); no TypeScript-to-Swift/Kotlin
transpiling, handlers are data, a JS engine only where a handler truly needs one (not used yet); routes stay the one
authoring concept; no per-platform markers in authoring; Dragon compiles CSS at build time and the only on-device library is
layout; Maestro for native flows, Playwright for web.

## 4. The contract, rungs 1 to 3

### The payload (`markless.native-view/0`)

Emitted by the compiler from the semantic graph. Example, rung 3's counter:

```tsrx
export function Counter() @{
	let count = state(0);
	<main class="screen">
		<h1 class="title">Counter</h1>
		<button class="tap" onClick={() => count++}>Count {count}</button>
	</main>
}
```

```json
{
  "version": "markless.native-view/0",
  "component": "Counter",
  "cells": [{ "id": "state:count", "name": "count", "initial": 0 }],
  "nodes": [
    { "kind": "element", "id": "h0", "element": "main", "parent": null },
    { "kind": "element", "id": "h1", "element": "h1", "parent": "h0" },
    { "kind": "text", "id": "h1:text0", "parent": "h1", "parts": [{ "text": "Counter" }] },
    { "kind": "element", "id": "h2", "element": "button", "parent": "h0" },
    { "kind": "text", "id": "h2:text0", "parent": "h2", "parts": [{ "text": "Count " }, { "cell": "state:count" }] }
  ],
  "events": [{ "host": "h2", "event": "activate", "handler": "handler:event:0" }],
  "handlers": [{ "id": "handler:event:0", "ops": [{ "op": "add", "cell": "state:count", "value": 1 }] }]
}
```

- **Nodes** are in document order; a parent precedes its children. Element ids are the compiler's host ids (`h0`...), the same
  ids the web payload and Dragon use. A text node is one run of adjacent static text and bound values inside one element;
  its id is `<element>:text<n>` (n counts text runs in that element), which is also Dragon's text node id.
- **Text parts:** `{ "text" }` is literal; `{ "cell" }` is the cell's current value formatted as JavaScript's `String(value)`
  (so integer `1` is `"1"`, never `"1.0"`; hosts must implement this exactly; non-integer numbers are refused in v0).
- **Events** are semantic. Authored `onClick` lowers to `activate`. Platform mapping (owned by each adapter): web `click`,
  iOS `UIControl.Event.touchUpInside`, Android `View.OnClickListener`.
- **Handlers** are lists of ops: `{ op: 'add', cell, value }` (`x++` is `+1`, `x--` is `-1`; numbers only),
  `{ op: 'set', cell, value }` (`x = 'b'`, `x = 3`, `x = true`: a literal string, integer or boolean) and
  `{ op: 'toggle', cell }` (`x = !x`). Anything else (`x = x * 2`, a call, a member write) is refused for now. A handler is lowered only when the
  analyzer proves its body is nothing but state writes (`handlerWriteStatements`); otherwise the compiler refuses with a
  diagnostic instead of guessing. Ops run in order; then every text node reading a changed cell is recomputed.
- **Journal:** after a handler, the runtime emits `{ "op": "text", "node": "h2:text0", "value": "Count 1" }` for each text
  node whose string changed, in document order. Hosts apply journal entries to their retained views and do nothing else to
  them. The TypeScript reference runtime in `packages/mobile/src/runtime.ts` defines the expected journal; each host must
  reproduce the conformance vectors byte for byte.

### Building a payload and the conformance vectors (pushed)

- Compile: `compileNativeComponent({ filename, source })` from `@markless/mobile` (`packages/mobile/src/compile.ts`) returns
  `{ passId: 'native-view', payload, diagnostics }`. `payload` is `null` whenever there is a diagnostic (code
  `MARKLESS_NATIVE_UNSUPPORTED`, one per construct with no native lowering yet: child components, `@if`/`@switch`, `@for`,
  `@try`, `attach`, non-text bindings, handlers that read the event, are async, or do more than write state, and events other
  than click). The pass itself is `createNativeViewPayload(semanticGraph)` in `packages/compiler/src/passes/native-view.ts`.
- Reference runtime: `createNativeRuntime(payload)` in `packages/mobile/src/runtime.ts`: `texts()` gives every text node's
  string in document order; `dispatch({ event: 'activate', host })` runs the handler's ops and returns the journal.
- **Vector file** (`markless.native-conformance/0`), one JSON per component under `packages/mobile/conformance/<name>.json`,
  written by `nativeConformance(payload, actions)`:

```json
{
  "version": "markless.native-conformance/0",
  "payload": { "version": "markless.native-view/0", "...": "the payload above" },
  "initial": [["h1:text0", "Counter"], ["h2:text0", "Count 0"]],
  "steps": [
    { "action": { "event": "activate", "host": "h2" }, "journal": [{ "op": "text", "node": "h2:text0", "value": "Count 1" }] },
    { "action": { "event": "activate", "host": "h2" }, "journal": [{ "op": "text", "node": "h2:text0", "value": "Count 2" }] }
  ]
}
```

  Committed files today: `counter.json` (add) and `switches.json` (toggle, set of a string and a negative integer, boolean
  and string formatting, and a step whose journal is empty because the text did not change). A host must pass every file in
  the folder; a new op or node kind always arrives with a new vector file first.
  A host passes the vectors when, loading `payload`, its mounted text nodes read exactly `initial` (same order) and, for each
  step in turn, dispatching `action` makes its runtime produce exactly `journal` (same entries, same order) and its views then
  show those strings. Hosts run this headless in their own unit tests (XCTest / a JVM test with no device) and may also run it
  in-app behind a launch flag. `packages/mobile/test/conformance.test.ts` fails if the committed vectors drift from what the
  compiler and the reference runtime produce.

### Element to view (per platform, rungs 1 to 3)

| Element | iOS (UIKit) | Android (Views) |
|---|---|---|
| any non-control element (`main`, `div`, `h1`, `p`...) | `UIView` | `FrameLayout` |
| `button` | `UIButton(type: .custom)`, trait `.button` | `android.widget.Button` with platform styling cleared (no background drawable, no min size, no all-caps, no state animator) |
| text node | `UILabel` child of its element (`isUserInteractionEnabled = false`) | `TextView` child (`includeFontPadding = false`, not clickable) |
| `h1`...`h6` | `.header` accessibility trait | `isAccessibilityHeading = true` |

Answered requests (native-android-host, 2026-11-17):

- **A button's text on Android:** confirmed. A `button` whose content is exactly one text run takes that run as the
  `Button`'s own text; a button with an element child or a second run is a loud host error for now. When a rung needs such
  a button, the Android cell becomes a `FrameLayout` with `accessibilityClassName = android.widget.Button`, clickable and
  focusable; this file will say so first. iOS keeps a `UILabel` inside the `UIButton` (UIKit allows children).
- **Units in the style export:** frames and `borderWidths` are device px; every length *inside a write*
  (`font.size`, `border-radius` lengths, and any later write) is CSS px, so hosts multiply by the target's `dpr` (Android)
  or use it as points (iOS, where 1 CSS px = 1 pt). Dragon's export will say so per field.
- **`html` and `body` in the export:** they are Dragon's document wrapper, not payload nodes. Hosts skip any export node
  the payload does not name, add its frame offset to its children, and never apply its writes. The screen behind the
  root is the platform's default background.
- **Pixel ratio:** one export per target device (the export already has one entry per target); a host refuses an export
  whose `dpr` differs from the screen's by more than 0.001.

Rungs 1 and 3 run without Dragon: hosts stack children vertically (start-aligned, system font, platform default size). This
is a temporary layout so the state rungs do not wait on styling; rung 2 replaces it with Dragon frames.

### Styles through Dragon (rung 2), as far as known

Proven tonight in the Dragon worktree (`examples/markless-counter/tools/export.ts`): Dragon compiles the component's CSS and
element tree for `ios` and `android` and emits, per node id, the lowered writes in each backend's vocabulary (background
colour, border widths/styles/colours, corner radii, font face and size, text colour) plus each box's frame from Dragon's
layout engine at the device's viewport and pixel ratio. File: `dragon.native-style-export/0`, units device pixels, frames
relative to the parent box, font faces named by the SHA-256 of the bundled file (Inter Regular and Bold from Dragon's
vendored fonts). Chrome check (`examples/markless-counter/tools/chrome-compare.ts`): every box of the counter matches Chrome
at iPhone 402 pt @3x and Pixel 411 dp @2.625 within Dragon's 1-device-pixel gate (largest difference 0.0005 device px). This
compares Dragon's build-time layout with Chrome, not the device's pixels.

#### The handoff, both directions (pushed on the Markless side)

1. **Markless to Dragon, `markless.native-style-input/0`.** `nativeStyleInput(build.payload, build.styles)` in
   `packages/mobile/src/style-input.ts`, all from compiler facts:
   `{ version, component, nodes: [{ kind: 'element', id, element, parent, attributes } | { kind: 'text', id, parent, text }], css }`.
   `attributes.class` is the class as written to the element, including the component's scope class (`tap mk-uclxwk`);
   `text` is the text node's string at mount (`Count 0`); `css` is the compiler's scoped CSS for the module, the same text
   the web build ships (`.tap.mk-uclxwk { ... }`). There is no `html`/`body`: Dragon wraps the tree in its own document
   (zero body margin, the configured font map: `sans-serif` and the initial font pinned to "Dragon Sans" until the owner
   picks fonts). Ids are the payload's ids; Dragon must use them unchanged for elements and for text nodes (`h2:text0`).
2. **Dragon to Markless, `dragon.native-style-export/0`** (as exported tonight by `examples/markless-counter/tools/export.ts`):
   `{ schema, units, compiler, source, warnings: [{ code, message }], fonts: [{ id, file }], targets: { ios, android } }`,
   each target `{ backend: 'uikit' | 'android-views', viewport: { width, height }, dpr, nodes: [...] }`, each node
   `{ id, parent, kind: 'element' | 'text' | 'anonymous', native, text, frame: { x, y, width, height } | null, borderWidths:
   { top, right, bottom, left } | null, writes: [...] }`. All lengths in device pixels; frames relative to the parent box.
   `writes` are Dragon's lowered writes minus its internal notes: each has `kind` and `key` (the backend property) plus its
   values. Kinds seen so far: `background-color { color }`, `border-widths`, `border-styles { styles[4] }`,
   `border-colors { colors[4] }`, `border-radius { lengths[8] }`, `font { font: { family: <face id>, size } }`,
   `text-color { color }`, `synthetic-bold`; colours are `{ r, g, b, alpha }` 0 to 255. A face id is
   `sha256:<hex of the font file>` and `fonts` maps it to the vendored file the app bundles.
3. **How a build obtains it (tonight):** Dragon is not published, so Markless does not import it. The harness writes the
   style input to `proofs/<rung>/native-style-input.json`; a Dragon CLI (native-dragon-styles owns it) run from a Dragon
   checkout named by `MARKLESS_DRAGON_DIR` turns it into `proofs/<rung>/native-style.json`, which is committed with the
   Dragon commit it came from. Both hosts read only `native-style.json`. Whether Markless later depends on a Dragon
   prerelease is an owner decision.
4. **Hosts:** apply writes by `kind`; fail loudly on a kind they do not implement; place views by `frame` inside their parent
   (absolute), scaling device pixels by the screen scale (iOS points = px / 3 on the proof device, Android uses px); refuse
   to run if the device's scale differs from the target's `dpr`. Text keeps Dragon's frame; after a journal entry the
   frame is not recomputed yet (on-device layout is a later rung), which is visible only when text width changes.

## 5. The ladder

Each rung: a real `.tsrx` compiled by the real compiler, the same Maestro flow green on the iOS simulator and the Android
emulator, the web build of the same component as the reference. A rung green on one platform only is not passed.

| # | Rung | Web | iOS | Android | Check |
|---|---|---|---|---|---|
| 1 | Static elements and text | not started | not started | not started | `proofs/01-static-text/flow.yaml` |
| 2 | Styles through Dragon | n/a | not started | not started | Dragon Chrome compare green (above); device flow pending |
| 3 | A state write updates text (counter) | not started | not started | not started | `proofs/03-counter/flow.yaml` + conformance vectors |
| 4 | Attributes and classes that follow state | not started | not started | not started | |
| 5 | `@if` | not started | not started | not started | |
| 6 | Keyed `@for` (add, remove, reorder) | not started | not started | not started | |
| 7 | Child component with props and a callback | not started | not started | not started | |
| 8 | Text input and two-way state | not started | not started | not started | |
| 9 | Storage | not started | not started | not started | |
| 10 | State from the URL and one route change | not started | not started | not started | |
| 11 | Async value with `@try`/`@pending`/`@catch` | not started | not started | not started | |

Compiler side done for rungs 1 and 3: static text positions (`SemanticMarkupChunk.texts`, kept out of the web render-data
module), `SemanticEvent.handlerWriteStatements`, the `native-view` pass (`packages/compiler/test/native-view.test.ts`), the
reference runtime and the counter's vectors (`packages/mobile/test/conformance.test.ts`).

## 6. Decisions open for the owner

- How Markless depends on Dragon before Dragon publishes (a workspace link for local builds, or an npm prerelease).
- How an app expresses a platform difference (the `target` constant is a candidate; nothing is built).
- Whether device lanes run in Markless CI (macOS runners with simulator and emulator) or as Dragon does, on a schedule.
