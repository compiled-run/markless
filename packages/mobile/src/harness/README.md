# The proof harness

One command runs ladder rungs end to end on both platforms:

```sh
pnpm --filter @markless/mobile proof proofs/03-counter [proofs/01-static-text ...]
```

For each rung folder it compiles `App.tsrx` with `compileNativeComponent()`, builds (or reuses from cache) the iOS app and the
Android APK around the hosts in `src/adapters/`, embeds the payload, installs both on a simulator and an emulator it boots
itself (and shuts down afterwards unless `--keep-devices`), runs the rung's `flow.yaml` with Maestro on each, saves a
screenshot before and after every step to `<rung>/screenshots/{ios,android}/`, and checks every step of `expected.json`.
It exits 1 unless every rung passes on both platforms; there is no way to run one platform alone.

| What                     | Where                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App id on both platforms | `dev.markless.proof` (`proof-app.ts`); flows say `appId: ${APP_ID}` and the harness sets it                                                                                                                                                                                                                                 |
| Bytes the shells read    | `markless/payload.json`, `markless/style.json` (optional), `markless-fonts/<sha256>.ttf`, inside the iOS bundle and the APK's assets                                                                                                                                                                                        |
| iOS shell                | `shells/ios/Shell.swift`: a scene delegate that hands the bytes to `MarklessViewController(payload:style:fonts:)`                                                                                                                                                                                                           |
| Android shell            | `shells/android/.../ShellActivity.kt`: a `MarklessActivity` that reads the bytes from assets                                                                                                                                                                                                                                |
| Building                 | iOS: each library target of the host's Swift package (from `swift package describe`) becomes a static module, then `swiftc` links the shell; no Xcode project. Android: `kotlinc`, `d8`, `aapt2`, `zipalign`, `apksigner`; no Gradle. Shell builds are cached under `~/.cache/markless-proof` by the hash of their sources. |
| Devices                  | `--simulator`, `--avd`, `--port` (or `MARKLESS_PROOF_SIMULATOR`, `MARKLESS_PROOF_AVD`, `MARKLESS_PROOF_EMULATOR_PORT`); a missing simulator or AVD is created. Devices already running are reused and left running.                                                                                                         |

## How a flow is checked

A step is one action command of the flow (`launchApp`, `tapOn`, `inputText`...) with the checks that follow it. Step `n`
lines up with `expected.json`'s `steps[n]`; a count mismatch is an error. The harness runs an instrumented copy of the flow:
`takeScreenshot` before and after each step, and after the flow's own checks, `assertVisible` for each `visible` text,
`assertNotVisible` for each `absent` one and a disabled `assertVisible` for each `disabled` one, matched literally. A
failure is named from Maestro's own record of the run (`commands.json`): the step, its action, and whether a flow command or
an `expected.json` text failed. `order` and `fields` in `expected.json` are not checked by the harness yet; the flow checks them.

The two platforms' Maestro runs go one after the other: Android's on-device driver died when a second Maestro process ran
beside it.

## Proving the harness itself

`fixture/` holds hand-made rungs run against `stub-host/` (`--host stub`), stand-ins with the hosts' entry points and a
screen that ignores the payload except for a per-platform button label:

```sh
pnpm --filter @markless/mobile proof --host stub src/harness/fixture/00-harness                   # passes on both
pnpm --filter @markless/mobile proof --host stub src/harness/fixture/00-harness-wrong-text        # fails on both: expected.json is wrong
pnpm --filter @markless/mobile proof --host stub src/harness/fixture/00-harness-ios-differs       # fails on iOS only, exit 1
pnpm --filter @markless/mobile proof --host stub src/harness/fixture/00-harness-android-differs   # fails on Android only, exit 1
```
