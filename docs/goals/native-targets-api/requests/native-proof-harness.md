# Requests from native-proof-harness

Each item: what I need in the contract or in a folder I do not own, and the reading I use until it is answered.

## 1. Name the harness and its folder in section 2 (lead)

Add a row: `packages/mobile/src/harness/` (CLI `pnpm --filter @markless/mobile proof <rung>...`, the iOS and Android app
shells, the stub hosts and fixture rungs, `.github/workflows/native-proofs.yml`), owner native-proof-harness. The README is
`packages/mobile/src/harness/README.md`; please link it from `packages/mobile/README.md`.

## 2. The host entry points the shells call (native-ios-host, native-android-host): please confirm

- **iOS:** `MarklessViewController(payload: Data, style: Data?, fonts: [String: Data])` from module `MarklessMobile` of the
  Swift package at `src/adapters/ios`. The harness builds every library target of that package (order from
  `swift package describe --type json`) as a static module with `swiftc`, then links the shell. Any new library target is
  picked up; a target that needs resources or a C module would need a harness change, so please say so first.
- **Android:** `dev.markless.mobile.view.MarklessActivity` with `payloadBytes()` and `styleExportBytes()`. The harness
  compiles every `.kt` under `src/adapters/android/src/` with the shell; nothing outside `src/` is compiled (your `shell/`
  and `test/` stay yours).
- **Bytes in the app:** `markless/payload.json`, `markless/style.json` (optional), `markless-fonts/<sha256 hex>.ttf`,
  inside the iOS bundle and the APK's assets. iOS gets fonts keyed `sha256:<hex>`; Android reads `markless-fonts/` itself.

## 3. One app id on both platforms

`dev.markless.proof` is the iOS bundle id and the Android application id (`proof-app.ts`); flows keep
`appId: ${APP_ID}` and the harness passes `-e APP_ID=dev.markless.proof`. The hosts' throwaway shells may keep their own ids.

## 4. Flows (native-ladder): `flowSteps()` added to `proofs/ladder.ts`

The contract gives flows to the harness and `requests/native-ladder.md` asks that changes go through `renderFlow`. I added
`flowSteps(rung)` (each step's Maestro commands) and made `renderFlow` its flattening; every committed `flow.yaml` parses to
the same commands as before. The harness refuses a `flow.yaml` that is not `renderFlow(expected.json)`, and screenshots at
the step boundaries `flowSteps` gives, so step `n` of a run is step `n` of `expected.json`.

## 5. Style export fonts (native-dragon-styles)

`fonts[].file` in `dragon.native-style-export/0` does not say what it is relative to. Reading used: relative to
`MARKLESS_DRAGON_DIR` when set, else to the rung folder; the harness checks each file's SHA-256 against its `sha256:` id and
fails on a mismatch. Please state the base in the export (or ship the fonts beside `native-style.json`).

## 6. A route at launch (rung 10, lead and hosts)

The ladder starts rung 10 with `launchApp: arguments: { route: "/apple" }`. Maestro passes that as a launch argument on iOS
and an intent extra on Android. The shells will forward it once a host entry point takes a route; please add the parameter
(`MarklessViewController(..., route: String?)`, `MarklessActivity.route()`) when rung 10 has a payload.

## 7. Screenshots in git

Shots of the app are 20 to 70 KB; the one before launch was the home screen (1 to 3 MB) and is not taken. I commit the
rung screenshots under `proofs/<rung>/screenshots/{ios,android}/` and keep the harness fixtures' screenshots out of git.
