# The proof harness

On a shared machine, submit rungs to the machine's phone runner instead of booting phones here: see
[`../runner/README.md`](../runner/README.md).

One command runs ladder rungs end to end on both platforms:

```sh
pnpm --filter @markless/mobile proof proofs/03-counter [proofs/01-static-text ...]
```

For each rung folder it compiles `App.tsrx` with `compileNativeComponent()`, builds (or reuses from cache) the iOS app and the
Android APK around the hosts in `src/adapters/`, embeds the payload, installs both on a simulator and an emulator it boots
itself (and shuts down afterwards unless `--keep-devices`), runs the rung's `flow.yaml` with Maestro on each, saves a
screenshot after every step and before every action to `<rung>/screenshots/{ios,android}/`, and checks every step of
`expected.json`.

A styled rung or app page gets its style export from Dragon (`MARKLESS_DRAGON_DIR`). An app's pages export at once, up to one
per worker the machine queue gives (`HEAVY_WORKERS`). Each export is cached under `~/.cache/markless-proof/style-exports` by
a hash of Dragon's commit, `--plan`, the OS release (the system fonts), the input file's path and bytes, and every font file it
names; a Dragon checkout with uncommitted changes is never cached. A rebuild with nothing changed takes about a second.
It exits 1 unless every rung passes on both platforms; there is no way to run one platform alone.

| What                     | Where                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App id on both platforms | `dev.markless.proof` (`proof-app.ts`); flows say `appId: ${APP_ID}` and the harness sets it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Bytes the shells read    | `markless/payload.json`, `markless/style.json` (optional), `markless-fonts/<sha256>.ttf`, inside the iOS bundle and the APK's assets                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| iOS shell                | `shells/ios/Shell.swift`: a scene delegate that hands the bytes to `MarklessViewController(payload:style:fonts:)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Android shell            | `shells/android/.../ShellActivity.kt`: a `MarklessActivity` that reads the bytes from assets                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Building                 | iOS: each library target of the host's Swift package (from `swift package describe`) becomes a static module, then `swiftc` links the shell; no Xcode project. Android: `kotlinc`, `d8`, `aapt2`, `zipalign`, `apksigner`; no Gradle. Shell builds are cached under `~/.cache/markless-proof` by the hash of their sources.                                                                                                                                                                                                                                                                                                                                                                                                        |
| Host overrides           | `--ios-host <swift package>`, `--android-host <kotlin src folder>`: prove a host branch before it merges                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Styles                   | A rung whose component has CSS writes `native-style-input.json` and gets Dragon's export at proof time from the Dragon checkout in `MARKLESS_DRAGON_DIR` (default `~/wt/dragon/native-dragon-styles`), which must contain the Dragon commit pinned in `packages/mobile/dragon.json`; fonts come from that checkout, or with `from: "input"` from beside the style input (an app's own font files; for a `.woff` or `.woff2` Dragon's export command writes the decoded sfnt to `dragon-decoded-fonts/<sha256>.ttf` there, so the shells load a plain sfnt), each checked against its `sha256:` id; an app (`pages/`) writes one input per styled page under `native-style-input/`, runs Dragon on each and ships one `markless.native-app-style/0` file (`style-size.json` records its size against the per-page exports) |
| Paths                    | Rungs and the modules they import compile with repo-relative filenames: the scope class hashes the filename, so every checkout builds the same payload                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Devices                  | `--simulator`, `--avd`, `--port` (or `MARKLESS_PROOF_SIMULATOR`, `MARKLESS_PROOF_AVD`, `MARKLESS_PROOF_EMULATOR_PORT`); a missing simulator or AVD is created. Devices already running are reused and left running.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## How a flow is checked

`flow.yaml` must be exactly what `renderFlow()` in `proofs/ladder.ts` writes from `expected.json` (regenerate with
`node packages/mobile/proofs/write-flows.ts`); the harness refuses a flow that drifted, so the flow's checks are the
rung's expected texts, including `order` and `fields`. `flowSteps()` gives each step's commands, and the harness runs an
instrumented copy with a `takeScreenshot` after each step and before each action (none before the launch: no app is on
screen yet). A failure is named from Maestro's own record of the run (`commands.json`): the step, its action, the Maestro
command and Maestro's message, plus Maestro's screenshot at the failure.

The two platforms' Maestro runs go one after the other: with an iOS Maestro run beside it, Android's run lost its device
connection in 4 of 8 tries on mini-2 (0 of 3 alone). On a loaded machine (load 20 to 45 on 18 cores) an Android run can still
drop with `device offline` or `Device server died`; that message names a device failure, not a wrong text, and nothing
retries it.

## Proving the harness itself

`fixture/` holds hand-made rungs run against `stub-host/` (`--host stub`), stand-ins with the hosts' entry points and a
screen that ignores the payload except for a per-platform button label:

```sh
pnpm --filter @markless/mobile proof --host stub src/harness/fixture/00-harness                   # passes on both
pnpm --filter @markless/mobile proof --host stub src/harness/fixture/00-harness-wrong-text        # fails on both: expected.json is wrong
pnpm --filter @markless/mobile proof --host stub src/harness/fixture/00-harness-ios-differs       # fails on iOS only, exit 1
pnpm --filter @markless/mobile proof --host stub src/harness/fixture/00-harness-android-differs   # fails on Android only, exit 1
```

## On CI

`.github/workflows/native-proofs.yml` (pull requests into main that change this package, and by hand) runs iOS on a
macOS runner and Android on a Linux runner with KVM, since GitHub's Apple silicon runners cannot run the Android emulator.
Each job runs `--platform <ios|android> --report <dir>`, which exits on its own platform's result but says it is not a
proof; the `verdict` job runs `node src/harness/verdict.ts ios.json android.json`, which fails unless both reports exist,
cover the same rungs and passed every one.

On a pull request push, a Linux job first prints the iOS job's pass key (`node src/harness/ios-proof-key.ts <rungs>`):
each rung bundled as the phone runner bundles it, the iOS host, the rest of `src` but Android's sources and the runner,
the rung folders, `proofs/ladder.ts`, `dragon.json`, the lockfile and the workflow. When an earlier push of the same pull
request passed on iOS with that key, the macOS job does not run and the verdict reads that run's iOS report, naming the
run. A rung that does not build on Linux gives no key, so the job runs. The same split works locally:

```sh
pnpm --filter @markless/mobile proof --platform ios --report /tmp/r proofs/03-counter
pnpm --filter @markless/mobile proof --platform android --report /tmp/r proofs/03-counter
pnpm --filter @markless/mobile proof verdict /tmp/r/ios.json /tmp/r/android.json
```
