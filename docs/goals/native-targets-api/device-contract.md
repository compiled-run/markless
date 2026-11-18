# Device features: the contract (web, iOS, Android)

Owner of this file: the device-slice lead on `cw/device-slice` (draft PR against `cw/native-targets`) and its follow-up
`cw/device-more` (draft PR against `cw/device-slice`). It extends `contract.md` beside it; everything there still holds.
Status 2026-11-17: working direction from the owner, with the planner's four decisions of 2026-11-17 applied (§7).

## 1. What authors write

```tsrx
import { camera, haptics, location, network, platform, recorder, settings, sharesheet } from '@markless/device';
import { base } from '@markless/ui';

<p>{network.online ? 'Online' : 'Offline'}</p>                 // a free live value: a property on the import
<button onClick={() => haptics.tap()}>Tap</button>              // a call in a handler
const here = computed(async () => location.current());          // a one-time ask, awaited, read inside @try
const cam = camera();                                           // a device object, owned by this component
<base.camera el={cam} />                                        // bound to its picture with `el`
<button onClick={async () => (photo = await cam.takePhoto())}>Take</button>
const rec = recorder();                                         // a device object with no picture
<button onClick={() => (rec.active = !rec.active)}>{rec.active ? 'Stop' : 'Record'}</button>
<audio src={rec.clip} controls />                               // the last clip, a file URL on phones
<button onClick={async () => await sharesheet.open({ title, url })}>Share</button>
<button onClick={() => settings.open()}>Open Settings</button>  // from a refused-access message
@if (!platform.web) { … }                                       // the only check that rules a feature out on the web
```

- **Free values** are properties on the import (`network.online`); reading one never asks permission.
- **One-time asks** are awaited functions (`location.current()`, `cam.takePhoto()`, `sharesheet.open({ title, url })`);
  a refused one rejects with an error named `NotAllowedError`, which lands in `@catch`: an async value's in the `@catch`
  of the `@try` that reads it, a handler's in the nearest `@catch` around the handler's element (decision 2). The system
  share panel is `sharesheet` (owner ruling, 2026-11-17), not `share`, which reads too close to `shared()`.
  `sharesheet.open` settles once the panel closes; it does not say whether something was shared (§6).
- **Device objects** (`camera()`, `recorder()`) are made in a component and released when the component stops being
  shown. Writable fields are settings (`cam.facing = 'front'`, `rec.active = true`), live fields are what it knows
  (`cam.ready`, `rec.seconds`, `rec.clip`). A setting the device cannot honour snaps back to the value in use (decision
  3): a refused microphone puts `rec.active` back to false, so a Record/Stop label reading it reads "Record" again.
- **Permission**: no request call. Using a feature asks. Each feature that needs permission has the live field `access`
  (`location.access`, `camera.access`, `recorder.access`: `'unknown' | 'granted' | 'limited' | 'denied' | 'blocked'`);
  reading it never prompts. `settings.open()` opens the app's own page in the system Settings app; `access` follows what
  the person changes there once they come back.

## 2. How each shape lowers (native payload `markless.native-view/0`, additions)

The compiler resolves every name through the analyzer's import facts (`moduleImports`: a local name bound to an import
from `@markless/device`); nothing matches names as text. Hosts gain no new expression kind.

| Authored                                                         | Payload                                                                                                                                                                                  | Host does                                                                                                                        |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `network.online` read anywhere an expression is allowed          | a **device cell** `{ id: 'device:network.online', name, initial, device: 'network.online' }`; reads are `{ cell }`                                                                       | reads the platform value at mount; on every change dispatches `{ event: 'device', cell, value }`                                 |
| `location.access`                                                | a device cell, as above                                                                                                                                                                  | same; reading never prompts                                                                                                      |
| `haptics.tap()` as a handler statement                           | op `{ op: 'call', call: 'haptics.tap', arguments: [expr] }`                                                                                                                              | runs the platform call when the `call` journal entry arrives                                                                     |
| `computed(async () => location.current())`                       | a **task cell** `{ id, name, initial: { state: 'pending' }, task: { call: 'location.current', arguments } }`                                                                             | starts the call at mount; dispatches `{ event: 'settle', cell, value }` or `{ event: 'settle', cell, error: { name, message } }` |
| `@try { a } @pending { b } @catch (e) { c }` reading a task cell | a `branch` with `tests` over the task's `state` (`'value'`, `'pending'`, `'error'`); `{answer}` reads `{ member: { cell }, property: 'value' }`, `e.message` reads the error's `message` | nothing new: branches and arms as today                                                                                          |
| `const cam = camera()`, `const rec = recorder()`                 | a **device object** `{ id: 'object:cam', device: 'camera', owner }` in the payload list `objects`; `owner` is the first node of the component instance that made it                     | creates it on first use; on a `release` entry (its owner stopped being shown) or when the page goes, stops it and lets it go      |
| `<base.camera el={cam} />`                                       | an element node `{ element: 'camera', object: 'device:cam' }`                                                                                                                            | builds the platform preview view (iOS `AVCaptureVideoPreviewLayer` host view, Android `PreviewView`-like `TextureView`)          |
| `cam.ready`                                                      | a device cell `{ device: 'camera.ready', object: 'device:cam' }`                                                                                                                         | as for free values                                                                                                               |
| `photo = (await cam.takePhoto()).url; …`                         | op `{ op: 'call', call: 'camera.takePhoto', object, arguments: [], after: { id, as, ops, catch? } }`: the statements after the `await` are `ops`, the answer reads as `{ local: as }`    | captures, then dispatches `{ event: 'resume', continuation, value }`, or `{ event: 'reject', continuation, error }` if it fails   |
| a failed awaited call inside a `@try` with a `@catch`            | `after.catch` names a cell (`<boundary>:catch`, initial null); the `@try` branch shows its `@catch` arm while that cell is not null, and `e` reads it                                    | dispatches `reject`; with no `catch` the rest of the handler simply does not run                                                 |
| `rec.active = !rec.active`                                       | `assign` to the `rec.active` device cell, then `call` `recorder.active` with the new value (as `cam.facing`)                                                                             | starts (asking for the microphone first) or stops; a refused or failed start dispatches `device` with `false`                    |
| `rec.seconds`, `rec.clip`, `recorder.access`                     | device cells; `clip` starts null and becomes a `file:` URL when a recording stops                                                                                                        | `seconds` once a second while recording                                                                                           |
| `<audio src={rec.clip} controls />`                              | an element node `{ element: 'audio', attributes: { controls: '' }, bindings: [src] }`                                                                                                    | a Play/Pause control over the platform player (AVAudioPlayer, MediaPlayer)                                                        |
| `await sharesheet.open({ title, url })`, `settings.open()`       | `call` ops; the share call has an `after` like any awaited call                                                                                                                          | presents the system share sheet (resumes when it closes) / opens the app's page in Settings                                       |

Journal: two new entries. `{ op: 'call', call, object?, arguments: [values], result?, resume? }`, emitted in op order
after the other entries of that dispatch; and `{ op: 'release', object }`, emitted after the node entries and before the
calls when an object's owner was shown before the dispatch and is not after. The reference runtime (`packages/mobile/src/runtime.ts`) defines all of it; conformance vectors
(`packages/mobile/conformance/device-*.json`) pin it for both hosts, including device and settle actions as steps.

Values: a task cell's value is `{ state: 'pending' } | { state: 'value', value } | { state: 'error', error: { name,
message } }`. A position is `{ latitude, longitude, accuracy }` (numbers). A photo is `{ url, width, height }`; `url` is a
`file:` URL on phones and an object URL on the web.

## 3. Permissions derived by the build

The `native-view` pass records `features`: every device feature the payload it lowered uses, each one reached through an
analyzer import fact (`base.*` elements join with D4). `deviceManifest(features, config)` (`packages/mobile/src/permissions.ts`)
maps them through one table, `DEVICE_FEATURES` in `@markless/serializer/native-device`:

| Feature  | iOS Info.plist key                    | Android manifest                                   |
| -------- | ------------------------------------- | -------------------------------------------------- |
| location | `NSLocationWhenInUseUsageDescription` | `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`   |
| camera   | `NSCameraUsageDescription`            | `CAMERA`                                           |
| haptics  | none                                  | none (`performHapticFeedback` needs no permission) |
| network  | none                                  | `ACCESS_NETWORK_STATE`                             |
| microphone (`recorder`) | `NSMicrophoneUsageDescription` | `RECORD_AUDIO`                                   |
| sharesheet, settings | none                              | none                                               |

Usage text comes from the app config, one place per app (decision 4): `device: { usage: { location, camera, microphone }
}`. The proof app's is `packages/mobile/proofs/app.json`, beside its rung folders (`readAppConfig` in the harness); no
rung carries its own. A feature that needs a key and has no text fails the build naming the feature and the key:
`MARKLESS_DEVICE_USAGE_MISSING: location needs usage text for NSLocationWhenInUseUsageDescription; add
device.usage.location to the app config`.

## 4. The web: device features are absent, removed at build time (owner decision 2026-11-17)

The build takes a target: `web`, `ios`, `android`, or `native` (one payload for both phones, where only `platform.web`
is decided: it is false). `@markless/device` fields and `platform` fold to that target's constants (`targetConstants` in
`@markless/serializer/native-device`, the one place their spelling lives). An `@if` they decide keeps one arm in both
analysis walks; a `{…}` they decide is static text; a component only a removed arm names is not collected at all. The
target analysis is passed in by Node builds (`deviceTargetFacts`: the bundler and native builds); the docs pages'
in-browser compiler leaves it out, so it never ships there.

On the web every feature is absent:

| Use                                                | Web build                                                                        | Rung                                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| a call whose result nothing uses (`haptics.tap()`) | removed from the handler; the module is never imported                           | D2 (W1): no `haptics.tap`, `vibrate` or `@markless/device` in any built file            |
| `<base.camera el={cam} />`                         | the part's markup sits behind `@if (!platform.web)`, so the web build removes it | W2: the part compiles to no markup on web (unit test); D4's web page has no camera node |
| a value read (`network.online`)                    | the constant below; branches it decides are removed                              | D1 (W3): banner text and "Offline" absent from every built file                         |
| a use that needs an answer                         | refused unless a `platform` check in the same component rules it out (decision 1, candidate c) | D3 to D7 web pages; `device-web-absence.test.ts`                              |

Constants each value takes on the web: `network.online` is `true`; `platform.web` is `true` and
`platform.ios`/`platform.android` are `false`. There is no `supported` field any more: `location.supported` is a use
like any other and is refused. **No honest constant** (decision 3, kept): `location.access`, `camera.access`,
`recorder.access` (there is no permission to report), and every field of a device object (there is no object). These
are not invented: reading one where the web build keeps it is refused (`MARKLESS_DEVICE_WEB_ABSENT`), and the web module
throws if one is reached at run time.

On phones `platform` is the phone's own (`ios` or `android`); live values stay live.

### W4: a use that needs an answer, three candidates measured (decided: c)

Kept as the record of the comparison; only (c) is built now. Measured with the compiler (emitted handler and render-data modules, gzip), on the D3 location example and a
take-photo button (then in `packages/mobile/test/fixtures/w4/`; the guarded and unguarded cases are now
`fixtures/web-guard/`); the web module itself is 412 B gzip when imported. Real
bundle sizes for the D1 to D4 pages are checked by the web ladder (nothing of the device module ships).

|                                           | (a) `supported` or `platform` check, else build error | (b) no error; the web module rejects into `@catch` | (c) only a `platform` check counts, else build error                        |
| ----------------------------------------- | ----------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------- |
| Location example: lines                   | 23 (guard plus a child component)                     | 15                                                 | 23                                                                          |
| Location: what the person sees on the web | "Location is not available here"                      | the `@catch` arm: `NotSupportedError`              | as (a)                                                                      |
| Location: client gzip                     | 258 B, no device module                               | 944 B + 412 B device module                        | 258 B, no device module                                                     |
| Take-photo: lines                         | 18                                                    | 20 (needs `@try`/`@catch` around the button)       | 18                                                                          |
| Take-photo: what the person sees          | no button                                             | a button that shows `NotSupportedError`            | no button                                                                   |
| Take-photo: client gzip                   | 457 B                                                 | 1033 B + 412 B                                     | 457 B                                                                       |
| Mistakes the build catches                | any unguarded use, a read with no honest constant     | none: the error appears only when the page runs    | same as (a); a `supported` guard is also refused, naming a `platform` check |

Reader evidence (round 3 of the A/B, `device-api-ab/round3/report.md`): readers predicted web behaviour 10 of 10 with
a `platform` check, 6.7 with `supported`, 7.0 with errors into `@catch`, 3.7 with silent removal; they took
`supported` for a run-time browser question, and all read `platform` as the build target. **Recommendation: (c)**,
because it costs the same bytes and lines as (a), catches the same mistakes, and is the guard readers understood. Its
cost: when a feature later gains web support, `@if (!platform.web)` guards must be revisited, where `supported` would
switch on by itself. **Decided (c)** (planner, 2026-11-17): it is the only behaviour built; the `deviceWebAnswers`
option, the `supported` field and candidates (a) and (b) are removed.

**A guard in a parent covers a use in a child** when both are in one module: the child is named only by the removed
arm, so the web build never collects it (D3's `Here`). A child in another file is compiled alone, sees no guard, and
stays a build error (decided); its message now says where the check goes: "put it inside a `platform` check, such as
`@if (!platform.web)`, in the component that uses it (a check in a parent in another file does not cover it)"
(`fixtures/web-guard/location-child.tsrx`).

## 5. The ladder and what proved each rung

Each rung: `packages/mobile/proofs/<rung>/` (`App.tsrx`, `expected.json` with a `web` section, one Maestro
`flow.yaml`; usage text comes from the app's one config, `proofs/app.json`), checked on the web (`ladder-web.test.ts`: the web steps, and named texts
absent from every built file), by the reference runtime per phone (`ladder-native-reference.test.ts`), and on the iOS
simulator and Android emulator by the proof harness, which now builds each phone's own payload. Vectors
`device.json`, `location.json`, `camera.json`, `handler-catch.json`, `recorder.json`, `sharesheet.json` and
`settings.json` hold both hosts to one meaning.

| Rung                                                                       | Web                                                                                  | Reference | iOS         | Android     | Data or engine                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------- | ----------- | ----------- | ------------------------------------- |
| D1 `network.online` follows the device                                     | **passing**: "Online" constant, banner and "Offline" absent from output              | passing   | **passing** | **passing** | data: a device cell                   |
| D2 `haptics.tap()` in a handler                                            | **passing**: call and module absent from output                                      | passing   | **passing** | **passing** | data: a `call` op                     |
| D3 `location.current()` in `@try`, refusal into `@catch`                   | **passing**: "Location is not available here"; the location panel absent from output | passing   | **passing** | **passing** | data: a task cell; `@try` is a branch |
| D4 camera object, preview, `ready`, `facing`, photo after `await`, release | **passing**: "No camera here"; camera markup and calls absent from output            | passing   | **passing** | **passing** | data (below)                          |
| D4b a refused `await cam.takePhoto()` in a handler lands in the nearest `@catch` | **passing**: "No camera here"; the button and `takePhoto` absent from output | passing | **passing** | **passing** | data: `after.catch` names a cell the `@try` branch reads |
| D5 recorder: `active` on and off, live `seconds`, a playable clip, refusal snaps back to "Record", release on close | **passing**: "No microphone here"; recorder markup absent from output | passing | **passing** | **passing** | data: a device object, its cells, a `call` per write, a `release` entry |
| D6 `sharesheet.open({ title, url })` reaches the system share sheet; the handler resumes when it closes | **passing**: "Sharing is not available here"; the button absent from output | passing | **passing** | **passing** | data: a `call` op with an `after` |
| D7 `settings.open()` from a refused-access message; `location.access` follows the change made in Settings | **passing**: "Location is not available here"; the message and button absent | passing | **passing** | **passing** | data: a `call` op; access is a device cell |
| P1 `platform` keeps one arm per target                                     | **passing**: iOS and Android arms absent from output                                 | passing   | **passing** | **passing** | build-time constant                   |

Receipts: `receipts/2026-11-17-device-{ios,android}-d1-d4-p1.json` (#794), and for the whole ladder on this branch,
D4b to D7 included, `receipts/2026-11-17-device-more-{ios,android}.json` with the verdict in
`receipts/2026-11-17-device-more-verdict.txt`. The phone-proof workflow runs only on pull requests into
`cw/native-targets`, so for this branch the receipts are local runs (simulator `markless-device-more`, AVD
`markless_device_more`).

D4, per behaviour, all as data, no engine:

- `const cam = camera()`: a device object (`objects` in the payload), one per component instance, an analyzer fact.
- `<base.camera el={cam} />`: an element `{ element: 'camera', object }`; the host asks its device for the view.
- `cam.ready`, `cam.facing`: device cells tied to the object.
- `cam.facing = …`: an `assign` to that cell, then a `call` to `camera.facing` the host applies. A camera the device
  does not have snaps the field back (the Android emulator has no front camera: "Facing back" after Flip).
- `photo = (await cam.takePhoto()).url; shots++`: one `call` op with `after: { as, ops }`, the statements after the
  `await` with the answer read as a local. The host answers the journal's `resume` with a `resume` action. Any number
  of statements after the `await` lower this way, and a later `await` nests another continuation. Still refused: two
  awaits in one statement, an await of something other than a device call. A rejected awaited call lands in the
  nearest `@catch` around the handler's element (D4b); with none, the rest of the handler does not run.
- Release: the preview runs while its view is on screen and releases the camera when it leaves (hiding the preview
  turns the test label to `camera off`; showing it again reopens).

What is real and what is a test double on each phone (D4):

- iOS simulator: no camera. Real: the camera permission prompt with the derived usage text, `camera.access`, the
  host's `AVCaptureVideoPreviewLayer` view class, the arm that adds and removes it. Test double (the proof shell's
  device): frames are a drawn pattern, `ready` turns true once access is granted, and a photo is that pattern written
  to a file.
- Android emulator: the AVD has an emulated back camera, so Camera2 runs for real: preview, `ready`, a captured JPEG
  (the emulator's synthetic scene), release and reopen. The shell only reports the session state in a label.

What is real and what is a test double, D4b to D7:

- **D4b (handler `@catch`)**: both phones real. The camera prompt is answered "Don't Allow"; the host refuses
  `takePhoto` at once with `NotAllowedError`, the runtime writes the `@catch` cell, and the `@try` shows "Photo failed:
  NotAllowedError". (On iOS the camera picture is still the D4 test double; it plays no part here.)
- **D5 (recorder)**:
  - iOS simulator: the Mac running it has no audio input, and the real `AVAudioRecorder` could not start there (the host
    snapped `active` back, decision 3, which is right but not the rung's point). So the proof shell's recorder is a test
    double, as its camera is: the microphone prompt with the derived `NSMicrophoneUsageDescription` text and
    `recorder.access` are real; `seconds` ticks from a timer; the clip is a generated tone written as AAC, played by the
    host's real `AVAudioPlayer` control ("Play" turns to "Pause"). The host's real `AVAudioRecorder` path is built and
    type-checked but has run on no device.
  - Android emulator: real. `RECORD_AUDIO` prompt, Android's `MediaRecorder` writing an `.m4a`, `seconds` from the
    host, and `MediaPlayer` playing the clip. The emulator runs with `-no-audio`, so the sound it captures is the
    emulator's own (no host microphone); the file and its length are real.
  - Release: tapping "Close recorder" while recording sends `release`; the test label turns to `microphone off`, and the
    reopened recorder starts at "Record", "Seconds 0", with no clip.
- **D6 (share sheet)**: both real system sheets. What a test can see: the sheet appears, with the title and URL the
  call passed ("Markless proof", "markless.dev"), and the handler resumes when it closes ("Closed 1"). What it cannot
  see: what the person picked; Android's chooser reports no result at all and iOS's is not exposed to the page, so
  `open` settles the same way whether or not something was shared. Closing: iOS 27 shows the sheet as a card that
  closes on a tap outside it; Android's closes on Back.
- **D7 (Settings)**: both real. iOS 27's simulator opens the Settings app at its root, not at the app's own page (a
  "◀ Proof" back link shows it came from the app), so the flow walks Apps → Proof → Location → While Using the App;
  Android opens the app's App info page and the flow taps Permissions → Location → Allow only while using the app.
  Coming back, neither app restarted (the calls label kept its history) and `location.access` read "granted": on iOS
  from the location manager's own callback, on Android from the host re-reading access when the app resumes (Android
  sends no callback for a grant). Not covered: camera and microphone changes in Settings, which iOS answers by
  restarting the app.
- **Access after a refusal and a relaunch differs** (open question 5): with the permission cleared between launches,
  iOS reads "unknown" again; Android reads "denied" (it remembers the refusal) and still asks again. D5 states both.

## 6. Open questions for the owner

Decided on 2026-11-17 (planner) and applied here: the web guard is a `platform` check only (old 1); values with no
honest web constant stay build errors (old 2); a failed awaited call in a handler goes to the nearest `@catch` (old 3);
a setting the device cannot honour snaps back (old 4); usage text lives in one app config (old 8). Still open, all about
the API an app author sees:

1. **`access` after a refusal** differs by platform: Android reports `blocked` where iOS reports `denied`, and after
   the permission is cleared Android still reads `denied` where iOS reads `unknown`.
2. **A device object never bound to an element** (`camera()` with no `<base.camera>`): made but never started, so
   `ready` stays false.
3. **`@markless/ui` depends on `@markless/device`** (the camera part reads `platform`); `@markless/device` is private
   and must be published before `@markless/ui` can release with this part.
4. **`sharesheet.open` cannot say whether something was shared.** The web's `navigator.share()` rejects with
   `AbortError` when the person cancels; Android's chooser reports nothing, so the phones settle on close either way.
   Keep "settles on close", or reject with `AbortError` where the platform can tell (iOS) and accept that Android
   cannot?
5. **The recorder's usage key is `device.usage.microphone`**, named for what the person is asked about, while the
   import is `recorder`. Keep it, or name it `recorder`?
6. **`rec.clip` is `null` until a recording stops**, and a new recording keeps the previous clip until it stops. Keep
   that, or clear `clip` when recording starts?
7. **`rec.active = true` shows "Stop" while the microphone prompt is up**, then snaps back to "Record" on a refusal
   (the screenshot of D5 step 1 shows it). Is the brief "Stop" acceptable, or should the write wait for the answer?
