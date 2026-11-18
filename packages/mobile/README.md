# @markless/mobile

Markless on iOS and Android. Private until the ladder in `docs/goals/native-targets-api/contract.md` proves it.

- `src/compile.ts`: `compileNativeComponent()`, a `.tsrx` module to the `markless.native-view/0` payload.
- `src/runtime.ts`: the reference meaning of state, ops and the update journal; both hosts are held to it.
- `src/conformance.ts` and `conformance/`: the vectors every host must reproduce.
- `src/adapters/ios/`: the UIKit host (Swift). `src/adapters/android/`: the Android Views host (Kotlin).
- `proofs/<nn>-<name>/`: one ladder rung each: `App.tsrx`, a Maestro flow run on both platforms, the web reference.
- `src/boundary/`: classifies every handler in the repo from the analyzer's native facts (data, data with a named
  extension, or general JavaScript); `node src/boundary/cli.ts <out.json>`. Report: `docs/goals/native-targets-api/handler-boundary.md`.
- `proofs-handlers/`, `src/script.ts`: proof only. Handlers that do not lower to data run in a JavaScript engine the host
  starts on first use (JavaScriptCore on iOS, QuickJS or Hermes on Android); see `proofs-handlers/README.md`.
