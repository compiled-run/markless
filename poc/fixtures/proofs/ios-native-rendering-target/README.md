# iOS Native Rendering Target

This proof checks whether an Arcade-style host-neutral graph/projection artifact
can drive real iOS native controls through JavaScriptCore.

It is intentionally narrow:

- authored source stays web-like TSRX;
- the serialized artifact stores graph cells, host nodes, event records, text
  bindings, and symbol IDs;
- the iOS runtime creates UIKit controls;
- the native button activation runs a JavaScriptCore symbol;
- the graph write flushes back into native button text.

This proof does not cover styling, Android, packaging a production app, DOM
islands, or production compiler integration.

## Authored Shape

```tsrx
import { state } from '@arcade/core';

export function Counter() @{
  let count = state(0);

  <main>
    <h1>Arcade iOS Proof</h1>
    <button onClick={() => count++}>Count {count}</button>
  </main>
}
```

## What The Artifact Proves

`src/artifact.json` records:

- `state:count` with initial value `0`;
- host nodes for `main`, `h1`, `button`, and button text;
- `onClick` lowered to semantic `activate` and iOS `touchUpInside`;
- `symbol:counter.increment`;
- a text binding that formats `Count ${value}`.

## Running The Local Verifier

```sh
node poc/fixtures/proofs/ios-native-rendering-target/src/verify.mjs
```

The verifier checks the artifact shape, authored source, Swift runtime, Swift
test, and forbidden core path strings.

## Running The iOS Simulator Proof

This requires full Xcode. To avoid changing the global developer directory, run
with `DEVELOPER_DIR`:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun simctl list devices available
```

Then run from this proof's `ios` directory:

```sh
xcodebuild test -scheme ArcadeNativeProof -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath .build/xcode-derived -resultBundlePath .build/ArcadeNativeProof.xcresult
```

If the local simulator name differs, use the nearest available iPhone simulator.

## Interacting With The Demo

To build, install, open Simulator, and launch the tappable UIKit demo:

```sh
bash poc/fixtures/proofs/ios-native-rendering-target/ios/Scripts/run-ios-demo.sh
```

The screen shows `Arcade iOS Proof` and a native count button. Tapping the
button runs the JavaScriptCore symbol, mutates the graph, and updates the native
button title.

## Current Environment Note

This proof passed on Xcode 26.5 with the iOS 26.5 Simulator runtime and the
`iPhone 17` simulator. The hostless XCTest creates real UIKit controls and
invokes the retained target/action bridge directly because `UIButton.sendActions`
requires a running `UIApplication`.
