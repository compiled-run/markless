# Device features: the contract (web, iOS, Android)

Owner of this file: the device-slice lead on `cw/device-slice` (draft PR against `cw/native-targets`). It extends
`contract.md` beside it; everything there still holds. Status 2026-11-17: working direction from the owner, not a ruling.

## 1. What authors write

```tsrx
import { camera, haptics, location, network } from '@markless/device';
import { base } from '@markless/ui';

<p>{network.online ? 'Online' : 'Offline'}</p>                 // a free live value: a property on the import
<button onClick={() => haptics.tap()}>Tap</button>              // a call in a handler
const here = computed(async () => location.current());          // a one-time ask, awaited, read inside @try
const cam = camera();                                           // a device object, owned by this component
<base.camera el={cam} />                                        // bound to its picture with `el`
<button onClick={async () => (photo = await cam.takePhoto())}>Take</button>
```

- **Free values** are properties on the import (`network.online`); reading one never asks permission.
- **One-time asks** are awaited functions (`location.current()`, `camera.takePhoto()`,
  `sharesheet.open({ title, url })`); a refused one rejects with an error named `NotAllowedError`, which lands in
  `@catch`. The system share panel is `sharesheet` (owner ruling, 2026-11-17), not `share`, which reads too close to
  `shared()`. It is not built yet.
- **Device objects** (`camera()`) are made in a component and released when it is hidden or leaves. Writable fields are
  settings (`cam.facing = 'front'`), live fields are what it knows (`cam.ready`).
- **Permission**: no request call. Using a feature asks. Each feature that needs permission has the live field `access`
  (`'unknown' | 'granted' | 'limited' | 'denied' | 'blocked'`); reading it never prompts. `settings.open()` opens the
  app's settings.

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
| `const cam = camera()`                                           | a **device object** `{ id: 'device:cam', kind: 'camera' }` in a new payload list `objects`                                                                                               | creates it with the screen; releases it when the page goes                                                                       |
| `<base.camera el={cam} />`                                       | an element node `{ element: 'camera', object: 'device:cam' }`                                                                                                                            | builds the platform preview view (iOS `AVCaptureVideoPreviewLayer` host view, Android `PreviewView`-like `TextureView`)          |
| `cam.ready`                                                      | a device cell `{ device: 'camera.ready', object: 'device:cam' }`                                                                                                                         | as for free values                                                                                                               |
| `photo = await cam.takePhoto()`                                  | op `{ op: 'call', call: 'camera.takePhoto', object: 'device:cam', arguments: [], result: <cell> }`                                                                                       | captures, then dispatches `{ event: 'settle', cell, value }`                                                                     |

Journal: one new entry, `{ op: 'call', call, object?, arguments: [values], result? }`, emitted in op order with the other
entries of that dispatch. The reference runtime (`packages/mobile/src/runtime.ts`) defines all of it; conformance vectors
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

Usage text comes from app config (`device: { usage: { location: '...', camera: '...' } }`). A feature that needs a key
and has no text fails the build naming the key: `MARKLESS_DEVICE_USAGE_MISSING: NSLocationWhenInUseUsageDescription has
no usage text; add device.usage.location to the app config`.

## 4. The web: device features are absent, removed at build time (owner decision 2026-11-17)

The build takes a target: `web`, `ios`, `android`, or `native` (one payload for both phones, where `platform` is not
decided). `@markless/device` fields and `platform` fold to that target's constants (`targetConstants` in
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
| a use that needs an answer                         | candidate (a), below, refuses it unless a check the build can see rules it out   | D3, D4 web pages; `device-web-absence.test.ts`                                          |

Constants each value takes on the web: `network.online` is `true`; every feature's `supported` is `false`;
`platform.web` is `true` and `platform.ios`/`platform.android` are `false`. **No honest constant:** `location.access`,
`camera.access` (there is no permission to report), and a camera object's `ready` and `facing` (there is no camera
object). These are not invented: reading one where the web build keeps it is refused (`MARKLESS_DEVICE_WEB_ABSENT`), and
the web module throws if one is reached at run time.

On phones `supported` is `true` and `platform` is the phone's own (`ios` or `android`); live values stay live.

### W4: a use that needs an answer, three candidates measured

Measured with the compiler (emitted handler and render-data modules, gzip), on the D3 location example and a
take-photo button (`packages/mobile/test/fixtures/w4/`); the web module itself is 412 B gzip when imported. Real
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
switch on by itself. Built default today: (a); (b) and (c) are selectable (`deviceWebAnswers`) for this comparison
only.

**A guard in a parent covers a use in a child** when both are in one module: the child is named only by the removed
arm, so the web build never collects it (D3's `Here`). A child in another file is compiled alone, sees no guard, and
is refused; covering it would need the cross-module render facts the bundler already links, which is not built.

## 5. The ladder and what proved each rung

Each rung: `packages/mobile/proofs/<rung>/` (`App.tsrx`, `expected.json` with a `web` section, one Maestro
`flow.yaml`, `app.json` for usage text), checked on the web (`ladder-web.test.ts`: the web steps, and named texts
absent from every built file), by the reference runtime per phone (`ladder-native-reference.test.ts`), and on the iOS
simulator and Android emulator by the proof harness, which now builds each phone's own payload. Vectors
`device.json`, `location.json`, `camera.json` hold both hosts to one meaning.

| Rung                                                                       | Web                                                                                  | Reference | iOS         | Android     | Data or engine                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------- | ----------- | ----------- | ------------------------------------- |
| D1 `network.online` follows the device                                     | **passing**: "Online" constant, banner and "Offline" absent from output              | passing   | **passing** | **passing** | data: a device cell                   |
| D2 `haptics.tap()` in a handler                                            | **passing**: call and module absent from output                                      | passing   | **passing** | **passing** | data: a `call` op                     |
| D3 `location.current()` in `@try`, refusal into `@catch`                   | **passing**: "Location is not available here"; the location panel absent from output | passing   | **passing** | **passing** | data: a task cell; `@try` is a branch |
| D4 camera object, preview, `ready`, `facing`, photo after `await`, release | **passing**: "No camera here"; camera markup and calls absent from output            | passing   | **passing** | **passing** | data (below)                          |
| P1 `platform` keeps one arm per target                                     | **passing**: iOS and Android arms absent from output                                 | passing   | **passing** | **passing** | build-time constant                   |

Receipts: `receipts/2026-11-17-device-{ios,android}-d1-d4-p1.json` and the verdict "proof passed on iOS and Android".

D4, per behaviour, all as data, no engine:

- `const cam = camera()`: a device object (`objects` in the payload), one per component instance, an analyzer fact.
- `<base.camera el={cam} />`: an element `{ element: 'camera', object }`; the host asks its device for the view.
- `cam.ready`, `cam.facing`: device cells tied to the object.
- `cam.facing = …`: an `assign` to that cell, then a `call` to `camera.facing` the host applies. A camera the device
  does not have snaps the field back (the Android emulator has no front camera: "Facing back" after Flip).
- `photo = (await cam.takePhoto()).url; shots++`: one `call` op with `after: { as, ops }`, the statements after the
  `await` with the answer read as a local. The host answers the journal's `resume` with a `resume` action. Any number
  of statements after the `await` lower this way, and a later `await` nests another continuation. Still refused: two
  awaits in one statement, an await of something other than a device call, a rejected awaited call (it ends the
  handler; there is no `@catch` for handlers on phones yet).
- Release: the preview runs while its view is on screen and releases the camera when it leaves (hiding the preview
  turns the test label to `camera off`; showing it again reopens).

What is real and what is a test double on each phone (D4):

- iOS simulator: no camera. Real: the camera permission prompt with the derived usage text, `camera.access`, the
  host's `AVCaptureVideoPreviewLayer` view class, the arm that adds and removes it. Test double (the proof shell's
  device): frames are a drawn pattern, `ready` turns true once access is granted, and a photo is that pattern written
  to a file.
- Android emulator: the AVD has an emulated back camera, so Camera2 runs for real: preview, `ready`, a captured JPEG
  (the emulator's synthetic scene), release and reopen. The shell only reports the session state in a label.

## 6. Open questions for the owner

1. **Which W4 candidate.** Recommendation (c), above.
2. **Values with no honest web constant** (`location.access`, `camera.access`, a camera's `ready` and `facing`): kept as
   build errors on the web. Should any of them have a web value?
3. **A rejected awaited call in a handler** (`await cam.takePhoto()` refused) ends the handler silently on phones.
   Should it reach a `@catch` around the handler's element, as a rejected handler does on the web?
4. **A writable field the device cannot honour** snaps back to the value in use. Is that the meaning you want, or
   should the write be refused at the call?
5. **`access` after a refusal** differs by platform (Android reports `blocked` where iOS reports `denied`).
6. **A device object never bound to an element** (`camera()` with no `<base.camera>`): today it is made but never
   started, so `ready` stays false.
7. **`@markless/ui` now depends on `@markless/device`** (the camera part reads `platform`); `@markless/device` is a
   private workspace package, so it must be published before `@markless/ui` can release with this part.
8. **Where usage text lives**: still a per-rung `app.json` standing in for app config.
