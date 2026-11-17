# Markless on Android (`dev.markless.mobile`)

The Android host runtime: it builds real Android Views from a `markless.native-view/0` payload and changes them afterwards only
by applying journal entries. No JavaScript engine, no web view, no custom drawing.

| Part | File | Uses `android.*` |
|---|---|---|
| Payload decoder (strict: unknown version, node kind, op, event, field or style kind is an error) | `src/dev/markless/mobile/core/Payload.kt`, `Json.kt` | no |
| Op interpreter (`assign` over the expression tree with ECMAScript meaning, storage cells, journal) | `core/Runtime.kt`, `core/Js.kt`, `core/JsString.kt`, `core/AttributeValue.kt` | no |
| Storage cells in `SharedPreferences` (values kept as JSON scalars) | `view/PreferencesStore.kt` | yes |
| Dragon style export reader (`dragon.native-style-export/0`, target `android`) | `style/StyleExport.kt` | no |
| View factory and journal applier | `view/MarklessHost.kt`, `view/MarklessBox.kt` | yes |
| Activity base | `view/MarklessActivity.kt` | yes |

## Embedding

```kotlin
class MyActivity : MarklessActivity() {
	override fun payloadBytes() = assets.open("markless/payload.json").use { it.readBytes() }
	override fun styleExportBytes() = assets.open("markless/style.json").use { it.readBytes() } // optional
}
```

Or without the Activity base: `val host = MarklessHost(context, payloadBytes, styleExportBytes)`, then add `host.root` to a
container. When a style export is given, `host.rootFrame` is the root's frame in device pixels inside the viewport (the
container lays the root out there; `MarklessActivity` does this and pads for system bars). Font faces named in the export
(`sha256:<hex>`) load from APK assets at `markless-fonts/<hex>.ttf`; pass a different `FontSource` to change that.

Views:

| Element | View |
|---|---|
| `button` | `android.widget.Button` with the platform styling cleared (no background drawable, no minimum size, no all caps, no state animator, no font padding). Its one text run is the button's own text. |
| any other element | `MarklessBox` (a `FrameLayout`): children stack vertically without a style export, sit at Dragon's frames with one |
| text run | `TextView` (`includeFontPadding = false`, not clickable), except inside a button |
| `h1`...`h6` | `isAccessibilityHeading = true` on the element and its text |

Every view reports its node id (`h2`, `h1:text0`) as its accessibility view id, so UI Automator, Maestro (`id: "h2"`) and
TalkBack find it. Each applied journal entry is logged under the tag `MarklessHost` as its JSON.

## Building

Everything is built from the SDK tools alone (aapt2, kotlinc, d8, zipalign, apksigner), no Gradle. Needs `kotlinc` on `PATH`,
Java 21, and `ANDROID_HOME` (default `~/Library/Android/sdk`) with build-tools 36.0.0 and platform android-36.

- `./test-jvm.sh [vector dir...]`: the JVM conformance test (no device). Runs the core against every
  `markless.native-conformance/0` vector in `packages/mobile/conformance/` and checks number formatting and decoder refusals.
- `./build-apk.sh <payload.json> <out.apk> [style-export.json [font.ttf...]]`: a throwaway proof APK (`shell/`, package
  `dev.markless.mobile.shell`, activity `.ProofActivity`) that shows one payload. The real app shell belongs to the proof
  harness; to embed this runtime elsewhere, compile `src/**/*.kt` with your own sources against `android.jar`.

Outputs go to `.build/` (ignored), or `$MARKLESS_ANDROID_OUT`.

## Checks on a device

In-app conformance: build with `MARKLESS_CONFORMANCE_DIR=<vector dir> ./build-apk.sh ...`, launch with
`adb shell am start -n dev.markless.mobile.shell/.ProofActivity --ez conformance true`, and read `adb logcat -s
MarklessConformance`: one `pass <vector>` or `FAIL <vector>: <what differed>` line per vector. `DeviceConformance.run` mounts
the vector's payload into real views, compares the TextViews with `initial`, then for each step calls `performClick()` on the
action's view, compares the journal byte for byte and checks the views show each journaled string. Last run: `pass
counter.json`; a copy with `Count 2` altered to `Count 3` logged `FAIL counter-altered.json: steps[1]: journal [...]`.


With a style export, `MarklessActivity` logs `frames max gap <n> device px` after the first layout: the largest distance
between any edge of a laid-out view and its Dragon frame (`MarklessHost.frameDeviation()`), with one `frame ...` line per
node. Text frames round outward (a run a fraction of a pixel narrower than its frame would wrap), so a text edge can sit up to
one device pixel outside Dragon's.

Last run (Pixel 7 AVD, android-36, 2026-11-17), counter payload from `packages/mobile/conformance/counter.json` with Dragon's
`examples/markless-counter/out/counter.native-style.json` (copied to `test/fixtures/`) and Inter Regular and Bold:
`frames max gap 0.984375 device px`; two taps on `h2` logged `journal {"op":"text","node":"h2:text0","value":"Count 1"}` then
`"Count 2"`. Screenshots: `screenshots/counter-styled-before.png`, `screenshots/counter-styled-after-two-taps.png`, and the
unstyled stack in `screenshots/counter-stack-*.png`.

## Ladder flows on Android (2026-11-17)

Each rung's `App.tsrx` compiled with `compileNativeComponent`, built with `./build-apk.sh <payload> <apk>`, then
`maestro --device <serial> test -e APP_ID=dev.markless.mobile.shell packages/mobile/proofs/<rung>/flow.yaml` on the Pixel 7
AVD (android-36), from the `assign`-shaped payloads (`a989dc47f` and later). The in-app conformance run logged `pass` for
`arithmetic.json`, `attributes.json`, `counter.json`, `if.json`, `input.json` and `switches.json`.

| Rung | Result | Screenshot |
|---|---|---|
| 01-static-text | flow passes | `screenshots/rung-01-static-text.png` |
| 02-styles | flow passes **without styles**: no Dragon export for this rung's component yet. Styles on device are proven only with Dragon's counter export (above). | `screenshots/rung-02-styles.png` |
| 03-counter | flow passes | `screenshots/rung-03-counter.png` |
| 04-attributes | flow passes (accessible name from `aria-label`, `enabled: false` from `disabled`); styles that follow the class (`state` entries over a `/1` export) are implemented and checked on the JVM against Dragon's toggle export, but unproven on device: no `/1` export with Markless ids exists yet | `screenshots/rung-04-attributes.png` |
| 05-if | flow passes (arms removed and built by `arm` journal entries) | `screenshots/rung-05-if.png` |
| 08-text-input | flow passes (`EditText`; typing dispatches `input` with the whole text through a `TextWatcher`; `Use Bo` writes the field through a `property` entry) | `screenshots/rung-08-text-input.png` |
| 09-storage | flow passes, including `stopApp` then `launchApp` reading `Kept 2` back (`SharedPreferences`, `PreferencesStore`) | `screenshots/rung-09-storage.png` |
| 06, 07, 10, 11 | not run: the compiler refuses these payloads (`MARKLESS_NATIVE_UNSUPPORTED`) | |

Bound attributes on Android: `aria-label` sets `contentDescription`; `disabled` present sets `isEnabled = false`;
`aria-pressed`/`aria-selected` `"true"` sets `isSelected`; `aria-expanded` sets the accessibility expanded state (API 36) and
the expand/collapse action; `class` does not reach views (styles follow state through `state` entries: the host moves to `next[current][s][v]` of the
`dragon.native-style-export/1` and re-applies that assignment's frames and writes). Other attributes are ignored. Static
attributes use the same mapping. An element with an `activate` event that is not a button reports `android.widget.Button` as
its accessibility class.
An `arm` entry removes the views of nodes no longer shown and builds every shown node without a view, in document order,
from current values, each inserted at its document position among its parent's children.
