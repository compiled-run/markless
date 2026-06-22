# macOS Native Rendering Target

This proof checks whether an Arcade-style host-neutral graph/projection artifact
can drive real macOS desktop controls through JavaScriptCore.

It is intentionally narrow:

- authored source stays web-like TSRX;
- the serialized artifact stores graph cells, host nodes, event records, text
  bindings, and symbol IDs;
- the macOS runtime creates AppKit controls;
- the native button activation runs a JavaScriptCore symbol;
- the graph write flushes back into native button text.

This proof does not cover styling, Windows, Linux, production packaging, browser
DOM islands, or production compiler integration.

## Authored Shape

```tsrx
import { state } from '@arcade/core';

export function Counter() @{
  let count = state(0);

  <main>
    <h1>Arcade macOS Proof</h1>
    <button onClick={() => count++}>Count {count}</button>
  </main>
}
```

## What The Artifact Proves

`src/artifact.json` records:

- `state:count` with initial value `0`;
- host nodes for `main`, `h1`, `button`, and button text;
- `onClick` lowered to semantic `activate` and macOS `action`;
- `symbol:counter.increment`;
- a text binding that formats `Count ${value}`.

## Running The Local Verifier

```sh
node poc/fixtures/proofs/macos-native-rendering-target/src/verify.mjs
```

The verifier checks the artifact shape, authored source, Swift runtime, Swift
test, demo app, demo runner, and forbidden core path strings.

## Running The macOS Native Test

```sh
swift test --package-path poc/fixtures/proofs/macos-native-rendering-target/macos
```

The XCTest creates real AppKit controls, invokes the retained target/action
bridge directly, runs the JavaScriptCore symbol, and verifies the native button
title updates from `Count 0` to `Count 1`.

## Interacting With The Demo

To build and open the clickable AppKit demo:

```sh
bash poc/fixtures/proofs/macos-native-rendering-target/macos/Scripts/run-macos-demo.sh
```

The window shows `Arcade macOS Proof` and a native count button. Clicking the
button runs the JavaScriptCore symbol, mutates the graph, and updates the native
button title.

For non-interactive verification of the same launch bundle:

```sh
bash poc/fixtures/proofs/macos-native-rendering-target/macos/Scripts/run-macos-demo.sh --verify-launch
```
