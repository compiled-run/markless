# @markless/mobile

Markless on iOS and Android. Private until the ladder in `docs/goals/native-targets-api/contract.md` proves it.

- `src/compile.ts`: `compileNativeComponent()`, a `.tsrx` module to the `markless.native-view/0` payload, and
  `compileNativeApp()`, an app's `pages/` to the `markless.native-app/0` payload (routes as screens).
- `src/app.ts`: the reference meaning of an app's stack: route matching, the back stack a path opens with, push,
  replace and Back (`docs/goals/native-targets-api/nav-contract.md`).
- `src/runtime.ts`: the reference meaning of state, ops and the update journal; both hosts are held to it.
- `src/conformance.ts` and `conformance/`: the vectors every host must reproduce.
- `src/adapters/ios/`: the UIKit host (Swift). `src/adapters/android/`: the Android Views host (Kotlin).
- `proofs/<nn>-<name>/`: one ladder rung each: `App.tsrx`, a Maestro flow run on both platforms, the web reference.
- `proofs/n<n>-<name>/`: one navigation rung each: an app (`pages/`), its flow and the web reference.
