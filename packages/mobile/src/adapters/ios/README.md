# MarklessMobile (iOS host)

The UIKit host for `markless.native-view/0` payloads. It builds real retained UIKit views once, runs handlers as data and
changes views only by applying journal entries. There is no SwiftUI and no custom drawing. A handler or computed the
compiler could not lower to data runs as JavaScript in JavaScriptCore (a system framework, so the app ships no engine);
rendering stays native.

- `Sources/MarklessCore` (Foundation only, so `swift test` runs on macOS): the strict JSON reader, the payload decoder, the op
  interpreter (`NativeRuntime`, the same meaning as `packages/mobile/src/runtime.ts`, including JavaScript `String(value)`
  for numbers) and the reader for Dragon's `dragon.native-style-export/0`, which it resolves to points. An unknown version,
  field, node kind, op, event or style write is an error, never skipped.
- `Sources/MarklessMobile` (UIKit): the view factory and journal applier (`ViewTree`) and the entry point,
  `MarklessViewController`. `MarklessScripting.shared` is the app's one script engine (`JavaScriptCoreEngine`), started
  the first time a screen needs it, plus the `fetch` and `console` (system log category `MarklessScript`) its scripts
  use; a script's timers are `timer` entries (`script:<n>`) the view tree schedules like a data timer. A screen whose payload has a script warms the engine once its first frame is up and the main run loop is
  idle; the Info.plist boolean `MarklessEngineWarm` set to false turns that off (the proof harness does this when
  `MARKLESS_PROOF_ENGINE_WARM=0`). The log also carries `engine start <ms> ms` and `first script entry <ms> ms (engine
  cold|warm)`, and once per launch `first frame <ms> ms (process start), <ms> ms (first controller created)`, taken
  after the run-loop turn that committed the first screen's views.

## Embedding

```swift
import MarklessMobile

let controller = try MarklessViewController(
	payload: payloadJSON,        // Data: the compiler's markless.native-view/0
	style: styleExportJSON,      // Data?: Dragon's export; nil stacks children vertically in the system font
	fonts: ["sha256:<hex>": interRegularBytes] // every face the export names, keyed by its id (bytes are hash-checked)
)
window.rootViewController = controller
```

`init` throws if the payload or the export holds anything this host does not implement. A style export laid out for
another screen scale (more than 0.001 apart) stops the app when the view appears. `controller.perform(NativeAction(event: .activate, host: "h2"))`
runs a handler exactly as a tap does.

Accessibility: every view's `accessibilityIdentifier` is its node id (`h2`, `h2:text0`). A `<button>` is one accessibility
element with the button trait, labelled by its text (kept current by the journal applier). Text under `h1` to `h6` has the
header trait.

The package can be added with SwiftPM (`.package(path: "packages/mobile/src/adapters/ios")`, product `MarklessMobile`),
or built with `swiftc` alone as `shell/build.sh` does (no Xcode project).

## Checks

- `swift test` (macOS, headless): the conformance vectors in `packages/mobile/conformance/*.json`, compared byte for byte as
  `JSON.stringify` text, plus decoder refusals, JavaScript number formatting and style resolution of Dragon's counter export.
- `TEST_RUNNER_MARKLESS_DRAGON_DIR=<dragon checkout> xcodebuild test -scheme MarklessMobile-Package -destination id=<simulator>`:
  the same tests and the UIKit ones (traits, labels, journal application, painted frames, borders and fonts) on a simulator.
- `shell/run.sh <simulator> <flow.yaml> <component.tsrx|payload.json> [style.json fonts-dir]`: a throwaway app shell built with
  `swiftc`, installed with `simctl`, driven by Maestro. The proof harness owns the real shell and flows; this one exists
  only so the host can prove rungs before that lands.
