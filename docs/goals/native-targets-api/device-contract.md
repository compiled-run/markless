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
- **One-time asks** are awaited functions (`location.current()`, `camera.takePhoto()`); a refused one rejects with an
  error named `NotAllowedError`, which lands in `@catch`.
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

## 4. The web

`@markless/device` (`packages/device`) is plain TypeScript on the web: `haptics.tap()` calls `navigator.vibrate`,
`location.current()` wraps `navigator.geolocation` and rejects with `NotAllowedError` when refused. A handler's device
call therefore works on the web today (D2).

A **live value read in markup** (`network.online`, `location.access`) and an **async computed that asks the device** are
refused on a web build with `MARKLESS_DEVICE_WEB_UNSUPPORTED` (analyzer, `semantic-graph/device-web.ts`). Following them
needs a page-wide subscription that no element owns, or a browser-only async value the server leaves pending, and
`specs/framework/04-events-symbols-behaviors.md` rules out free-floating browser behaviour ("anything without an element
doesn't belong in a component"). That is open question 1 below. Until it is decided the web build says so by name
instead of rendering the value once and never updating it.

## 5. The ladder and what proved each rung (2026-11-17)

Each rung: `packages/mobile/proofs/d<n>-<name>/` (`App.tsrx`, `expected.json`, one Maestro `flow.yaml`, `app.json` when
the build needs usage text), checked on the web (`ladder-web.test.ts`), by the reference runtime
(`ladder-native-reference.test.ts`), and on the iOS simulator and Android emulator by the proof harness. Shared vectors
`conformance/device.json` and `conformance/location.json` hold both hosts to one meaning.

| Rung | What                                                                                                          | Web                                        | Reference   | iOS         | Android     | Handler as data or engine                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------- | ----------- | ----------- | ------------------------------------------------------------------------------------------------------- |
| D1   | `network.online` in markup follows the device                                                                 | refused by name (open question 1)          | passing     | **passing** | **passing** | data: a device cell the host writes; text derives from it like any cell                                 |
| D2   | `haptics.tap()` in a handler                                                                                  | **passing** (`navigator.vibrate` recorded) | passing     | **passing** | **passing** | data: a `call` op, journalled as a `call` entry the host runs                                           |
| D3   | `location.current()` in `computed(async)` in `@try`: pending, value, refused into `@catch`; `location.access` | refused by name (open question 1)          | passing     | **passing** | **passing** | data: a task cell the host settles; `@try` is a branch over its `state`                                 |
| D4   | `camera()`, `<base.camera el={cam} />`, `cam.takePhoto()`                                                     | not started                                | not started | not started | not started | stopped: its live field `cam.ready` needs the same web decision, and `el` taking a device object is new |

How the phones were driven, and what is fake:

- **D1:** the network value comes from the proof shell's device, set by a `markless-proof://device/network.online?value=false`
  link the flow opens (iOS confirms the link with "Open"). The simulator shares the Mac's network and cannot go offline
  alone. The production hosts follow `NWPathMonitor` (iOS) and `ConnectivityManager` (Android); that path is not driven by
  this proof.
- **D2:** the call goes through the real host device layer (`UIImpactFeedbackGenerator`, `performHapticFeedback`); the
  shell's recorder lists it in a test-only label the flow reads. Simulators do not vibrate.
- **D3:** real platform location (`CLLocationManager`, `LocationManager.getCurrentLocation`) at a position Maestro sets,
  and the real system permission prompt answered by tapping it. While the prompt is up Maestro reads only the prompt's
  window, so on phones the pending step asserts the prompt and the screenshot shows "Locating" beneath it; the web
  refusal and the reference runtime check the pending text. After "Don't allow", iOS reports `access` `denied`;
  Android reports `blocked`, because it counts the harness's permission reset as an earlier refusal; the rung asserts
  `NotAllowedError` only.
- **Build facts:** `packages/mobile/test/device-build.test.ts`: the location entries derived from the import, the build
  failing with `MARKLESS_DEVICE_USAGE_MISSING` naming `NSLocationWhenInUseUsageDescription`, aliased imports, and a
  same-named object from another module not counted. The harness writes the derived keys into the test app's
  Info.plist (`plutil`) and `<uses-permission>` into its manifest; the D3 prompt shows the derived usage text.

What still needs a script engine (each refused by name): a call to author code, a device call used as a value, any
statement after an `await`, and an async computed whose body is anything but one device call.

## 6. Open questions for the owner

1. **Device values on the web.** Making `network.online` or `location.access` update a web page, or asking the device
   for an async computed, needs either a page-wide device subscription that no element owns (an exception to the
   "no free-floating behaviour" ruling in spec 04) or a different shape on the web, such as a component-made object
   (`const net = network()`) bound to an element. Native needs neither. Until decided, the web build refuses these by name.
2. **`await` then assignment in a handler, as data.** `photo = await cam.takePhoto()` would lower to a `call` op with a
   `result` cell. v0 refuses any statement after an `await`, so a handler is "calls, then at most one awaited call last".
   Is that line right, or should later statements become a continuation (still data)?
3. **Live fields of device objects.** `cam.ready` on the phones is a device cell like `network.online`; on the web it
   is question 1 again, though the element `el={cam}` names gives it an owner.
4. **A device object never bound to an element.** `const cam = camera()` with no `<base.camera el={cam}>`: refuse at
   build time, or allow capture without a preview?
5. **A writable field whose effect is refused.** `cam.facing = 'front'` with no front camera, or a setting permission
   does not allow: does the field keep the value, snap back, or reject like a one-time ask?
6. **`access` after a refusal differs by platform.** Android may report `blocked` after what the person saw as one
   refusal. Should Markless report the platform's own word, or normalise?
7. **Where usage text lives.** The build reads `device.usage.<feature>` from the app config; there is no native app
   config file yet, so the proofs use a per-rung `app.json`.
