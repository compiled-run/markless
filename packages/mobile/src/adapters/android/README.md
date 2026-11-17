# Markless on Android (`dev.markless.mobile`)

The Android host runtime: it builds real Android Views from a `markless.native-view/0` payload and changes them afterwards only
by applying journal entries. No JavaScript engine, no web view, no custom drawing.

| Part | File | Uses `android.*` |
|---|---|---|
| Payload decoder (strict: unknown version, node kind, op, event, field or style kind is an error) | `src/dev/markless/mobile/core/Payload.kt`, `Json.kt` | no |
| Op interpreter (cells, `add`, JavaScript `String(value)`, journal) | `core/Runtime.kt`, `core/JsString.kt` | no |
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
