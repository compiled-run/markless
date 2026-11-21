# Device features in Markless: camera, location and the rest

Research note, 2026-11-16. Docs only; no product code. Sources were read on 2026-11-16 unless a doc date is given. Each claim is tagged **[source]** (checked against the linked primary page or data), **[inferred]** (my reasoning or general knowledge, not checked) or **[unverified]** (read in a secondary summary, or the primary page did not say).

## Summary

**The question.** How should a Markless app reach device features such as the camera, photo library, location, notifications, haptics, share sheet, clipboard, biometrics, files, sensors and permissions? It has to work on web, iOS and Android from one way of writing code, within your rulings: no per-platform branches, no sigils, nothing that says where code runs, and no TypeScript transpiled to Swift or Kotlin.

**Recommendation.** Use the shapes Markless already has, plus one first-party package (working name `@markless/device`) for features the web has not settled. Something that shows on screen is an element. A one-off answer is an async function you `await` in a handler or read in `computed(async)` inside `@try`. A refusal arrives in `@catch` as an error. A fire-and-forget effect is a plain call in a handler.

Where a settled web standard already says it (`<input type="file" capture>` for "take a photo", `<video>`, `<img>`), the author writes that HTML and each device runtime maps it. Where no settled standard exists (a live camera with a shutter, haptics, biometrics, background location), the API is Markless's own, typed and imported.

The author never writes a permission request or a manifest entry. The compiler works out the Info.plist keys, Android permissions and native modules to link from which features each route can reach. It refuses the build when a usage description is missing or a target has no implementation.

**Why not one of the other options.** A web-standard-only design covers the three examples below on the web. But on phones the compiler would have to reinterpret imperative DOM code (canvas drawing, `srcObject`, callbacks), and haptics, biometrics, iOS notifications and sensors have no settled standard at all. A design that copies Expo and Capacitor works, but it makes every author learn a permission API that the web model, where calling the feature asks for permission, already makes unnecessary.

**The three examples in the recommended design.**

```tsrx
// 1. Take a photo and show it. Plain HTML; Markless turns the picked file into an image source.
import { state } from '@markless/core';

export default function Snap() @{
	let photo = state<File | null>(null);

	<main>
		<label>
			Take a photo
			<input type="file" accept="image/*" capture="environment"
				onChange={(event) => (photo = event.currentTarget.files?.[0] ?? null)} />
		</label>
		@if (photo) {
			<img src={photo} alt="The photo you took" />
		}
	</main>
}
```

```tsrx
// 2. Live camera preview with a shutter button. No settled standard: Markless's own element.
import { element, state } from '@markless/core';
import { Camera, type CameraElement } from '@markless/device';

export default function Viewfinder() @{
	const camera = element<CameraElement>();
	let photo = state<File | null>(null);
	let problem = state('');

	<main>
		<Camera el={camera} facing="back" onError={(event) => (problem = event.detail.name)} />
		<button onClick={async () => (photo = (await camera?.takePhoto()) ?? null)}>Take photo</button>
		@if (problem === 'NotAllowedError') {
			<p role="alert">Camera access is off. You can turn it on in Settings.</p>
		}
		@if (photo) {
			<img src={photo} alt="Last photo" />
		}
	</main>
}
```

```tsrx
// 3. Current location, with a state for "permission denied". The request is the call; denial is @catch.
import { computed } from '@markless/core';
import { currentPosition, openSettings } from '@markless/device';

export default function Nearby() @{
	const here = computed(async () => await currentPosition({ accuracy: 'approximate' }));

	<main>
		@try {
			<p>{`You are near ${here.latitude.toFixed(2)}, ${here.longitude.toFixed(2)}`}</p>
		} @pending {
			<p>Finding you…</p>
		} @catch (error, reset) {
			@if (error.name === 'NotAllowedError') {
				<section>
					<p>Location is off for this app.</p>
					<button onClick={() => openSettings()}>Open Settings</button>
					<button onClick={reset}>Try again</button>
				</section>
			} @else {
				<p>{error.message}</p>
			}
		}
	</main>
}
```

Building this for iOS adds `NSCameraUsageDescription` and `NSLocationWhenInUseUsageDescription` to Info.plist, with text from app config. The build fails, naming the key, if that text is missing. On Android it adds `CAMERA` and only `ACCESS_COARSE_LOCATION`, because the analyzer reads the literal `accuracy: 'approximate'`. **[inferred: proposed behaviour]**

**Decisions only you can make** (details at the end):

**Overall shape:** settled HTML where it exists, plus Markless's own `@markless/device` for everything else. I recommend this because it is the only option that covers the whole feature list without reinterpreting browser code on phones.

**Where permission text lives:** in app config, with a build error when it is missing. I recommend this because Apple rejects or crashes apps over missing or generic text, and a library default hides that.

**Picked photos as values:** allow `state()` to hold a picked or captured file and `<img src>` to take it. I recommend this because otherwise every author writes object-URL bookkeeping that the runtime can do correctly.

**Device-only work never runs on the server:** the compiler shows `@pending` on the server and starts the work on the device, with no marker. I recommend this because it follows the ruling that the compiler decides where code runs.

**Chrome's new `<geolocation>` and `<usermedia>` elements:** watch them, don't build on them. I recommend this because only Chrome ships them and WebKit has open concerns.

---

## 1. What "settled web standard" means here

Per your comment of 2026-11-16, an API counts as a web standard in this note only if it is **shipped in Chrome, Safari and Firefox**, or is **a finished spec that no engine opposes**. Engine data below comes from MDN's browser-compat data (`bcd.developer.mozilla.org/bcd/api/v0/current/<feature>.json`, read 2026-11-16), and spec status from the spec's page on w3.org/TR, both **[source]**.

| Web API | Chrome | Safari | Firefox | Spec status | Settled? |
|---|---|---|---|---|---|
| `<input type=file capture>` ([HTML Media Capture](https://www.w3.org/TR/html-media-capture/)) | Android 25+ | iOS 10+ | Android 79+ | W3C Recommendation, 2018-02-01 | **Yes.** All three ship it on mobile. Desktop browsers ignore `capture` and show a file picker, which is the spec's intended fallback |
| `<input type=file>` and `File` | all | all | all | WHATWG HTML (living standard) | **Yes** |
| `getUserMedia` ([Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/)) | 53 | 11 | 36 | Candidate Recommendation Draft, 2026-11-12 | **Yes** (shipped in all three) |
| `HTMLMediaElement.srcObject` | 108 (for a `MediaStream`, earlier) | 11 | 42 | WHATWG HTML | **Yes** |
| Canvas `drawImage` (grab a video frame) | 1 | 2 | 1.5 | WHATWG HTML | **Yes** |
| `ImageCapture.takePhoto` ([Image Capture](https://w3c.github.io/mediacapture-image/)) | 59 | 18.4 | flag only (`dom.imagecapture.enabled`) | Working Draft | **No.** Not on by default in Firefox |
| Geolocation `getCurrentPosition` ([Geolocation](https://www.w3.org/TR/geolocation/)) | 5 | 5 | 3.5 | Candidate Recommendation Draft, 2026-11-05 | **Yes** (shipped in all three) |
| `navigator.permissions.query` ([Permissions](https://www.w3.org/TR/permissions/)) | 43 | 16 | 46 | Working Draft, 2026-10-26 | **Yes for the call, not for the names**: `clipboard-read`, sensors and others are missing in Safari and Firefox ([BCD Permissions](https://bcd.developer.mozilla.org/bcd/api/v0/current/api.Permissions.json)) |
| `navigator.share` ([Web Share](https://www.w3.org/TR/web-share/)) | desktop 128, Android 61 | 12.1 | Android 79; not desktop | W3C Recommendation, 2023-05-19 | **Yes**: a finished spec with no engine opposed. Firefox desktop has not shipped it |
| `navigator.clipboard.writeText` | 66 | 13.1 | 63 | Working Draft, 2026-06-24 | **Yes** (shipped in all three) |
| `Notification.requestPermission` | 20 | 15 (iOS 16.4) | 22 | WHATWG Notifications | **Yes, as an API**, but iOS only allows it for web apps added to the Home Screen ([WebKit, 2023-02-16](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)) |
| `navigator.vibrate` ([Vibration](https://www.w3.org/TR/vibration/)) | 32 | **no** | 16 | Candidate Recommendation Draft, 2026-05-21 | **No.** Safari never shipped it, and it has no impact, selection or success styles |
| Biometrics | none | none | none | none. WebAuthn proves who the user is with a passkey; it is not a "confirm with Face ID" prompt | **No standard for the feature** |
| `showOpenFilePicker` (File System Access) | 105+ desktop | no | no; Mozilla's position is "harmful" | WICG draft | **No** ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker), [caniuse](https://caniuse.com/native-filesystem-api)) |
| Generic Sensor (`Accelerometer`) | 67 | no | no | WICG/W3C draft | **No** |
| `<geolocation>` element | 144 ([Chrome blog, 2026-01-13](https://developer.chrome.com/blog/geolocation-html-element)) | no | no | WICG ([spec](https://wicg.github.io/PEPC/geolocation-element.html)) | **No.** WebKit's position request is open with "concerns: API design" and "concerns: complexity" ([WebKit #545](https://github.com/WebKit/standards-positions/issues/545)); Mozilla is positive ([Mozilla #1288](https://github.com/mozilla/standards-positions/issues/1288)) |
| `<usermedia>` element | 151 ([Chrome blog, 2026-06-29](https://developer.chrome.com/blog/usermedia-html-element)) | no | no | WICG | **No.** Chrome plans `<camera>` and `<microphone>` next |

**What this means for the three examples.**
- **Take a photo:** settled (`<input capture>`).
- **Live preview with a shutter:** settled on the web only by drawing the `<video>` frame onto a canvas. That gives a frame at preview resolution, with no flash, focus or full-resolution capture, so a phone camera has to mean something different.
- **Location with a denied state:** settled (Geolocation's error code `PERMISSION_DENIED`).

So settled standards *cover* the examples on the web. They do not cover the rest of the feature list, and on phones example 2 only works if the compiler reinterprets imperative canvas code.

**Watch, don't build on:** the Chrome capability elements (`<geolocation>`, `<usermedia>`, the planned `<camera>`). They are a good idea for Markless in principle: an element that asks for permission and delivers the feature fits "intent as data". Markless should avoid taking the names `geolocation`, `usermedia` or `camera` as HTML tags, so that it can adopt them if they become settled. **[inferred]**

## 2. How others do it

Every ecosystem splits a device feature into the same three parts: a typed script surface, native code per platform, and build-time declarations (Info.plist usage strings, Android manifest permissions). They differ mainly in who writes that third part. Doc versions seen: Expo SDK 58, React Native 0.88, Capacitor 8 (Camera 8.1), Tauri 2, Flutter 3.50, NativeScript 9.1, Lynx 4.2, CameraX 1.6.2.

| System | What the author writes for camera and location | Permissions and manifest entries | How the call reaches native | Platform without the feature | Types | Tests |
|---|---|---|---|---|---|---|
| **Web** | `<input capture>`, `getUserMedia` plus `<video>`, `navigator.geolocation.getCurrentPosition(ok, fail)` | None declared. The first call prompts, often only after a user gesture | Browser | `undefined`, a promise that rejects (`NotAllowedError`), or a silent no-op (`vibrate`) | lib.dom; no per-browser gaps | Playwright `grantPermissions`, `setGeolocation`, Chromium fake-capture flags |
| **Expo** ([camera](https://docs.expo.dev/versions/latest/sdk/camera/), [modules API, 2026-09-25](https://docs.expo.dev/modules/module-api/)) | `<CameraView ref facing>`, `ref.current.takePictureAsync()`, `useCameraPermissions()`, `Location.requestForegroundPermissionsAsync()` then `getCurrentPositionAsync()` | The app lists each library's config plugin in app.json with its text. Prebuild runs those plugins to edit Info.plist and the manifest ([CNG, 2026-11-02](https://docs.expo.dev/workflow/continuous-native-generation/)). Android permissions arrive with the library | JSI (React Native's direct C++ link to native code), through a Swift/Kotlin DSL: `Function`, `AsyncFunction`, `Events`, `View` | Per-method platform labels. Web gets reduced results (base64 photos, `null` fields) | Hand-written TS on one side, the DSL on the other | `jest-expo` mocks the native part [source; mechanism unverified] |
| **React Native** ([Turbo Modules](https://reactnative.dev/docs/turbo-native-modules-introduction), [Fabric](https://reactnative.dev/docs/fabric-native-components-introduction)) | No built-in camera or location; community libraries | Manual. `PermissionsAndroid` is Android-only | Codegen from a TS spec produces Java/ObjC++ interfaces; calls cross JSI | `get` returns `null`; `getEnforcing` throws | The TS spec is the single source | `jest.mock` [unverified] |
| **Capacitor** ([camera](https://capacitorjs.com/docs/apis/camera), [web plugins](https://capacitorjs.com/docs/plugins/web)) | `Camera.takePhoto()` (8.1 replaces `getPhoto`), `Geolocation.getCurrentPosition()`, `checkPermissions` and `requestPermissions` | The author hand-edits Info.plist and the manifest | JSON message bridge from the web view [transport unverified] | A web class throws `unavailable` or `unimplemented` | A hand-written `definitions.ts`; native code is not checked against it | Manual Jest mocks, because plugins are Proxies ([guide](https://capacitorjs.com/docs/guides/mocking-plugins)) |
| **Tauri 2** ([capabilities, 2026-11-05](https://v2.tauri.app/security/capabilities/), [geolocation](https://v2.tauri.app/plugin/geolocation/), [mobile plugins](https://v2.tauri.app/develop/plugins/develop-mobile/)) | No core camera (barcode scanner, or `getUserMedia` in the web view). `checkPermissions()`, `requestPermissions(['location'])`, `getCurrentPosition()` | Two layers. The app grants permission identifiers per window in `capabilities/*.json` (`"platforms": ["iOS","android"]`), and hand-edits `Info.ios.plist`. Android entries merge from the plugin | JS `invoke`, then Rust, then `run_mobile_plugin`, then a Kotlin `@Command` or Swift `@objc` method | Mobile-only plugins are compiled out on desktop (`#[cfg(mobile)]`); a call that wasn't granted is refused at runtime | TS package plus serde structs; JSON schemas for the capability files | `mockIPC` ([mocking](https://v2.tauri.app/develop/tests/mocking/)) |
| **Flutter** ([platform channels, 2026-11-07](https://docs.flutter.dev/platform-integration/platform-channels), [camera](https://pub.dev/packages/camera), [image_picker](https://pub.dev/packages/image_picker), [geolocator](https://pub.dev/packages/geolocator)) | `CameraController` plus a `CameraPreview(controller)` widget, `picker.pickImage(source: camera)`, `Geolocator.getPositionStream()` | Hand-edited | `MethodChannel`/`EventChannel`, or Pigeon codegen (`@HostApi`, `@EventChannelApi`) | Runtime `MissingPluginException` | Raw channels are untyped; Pigeon is typed | Four documented seams, from wrapping the plugin to mocking the channel ([plugins in tests](https://docs.flutter.dev/testing/plugins-in-tests)) |
| **Kotlin Multiplatform** ([expect/actual, 2026-05-13](https://kotlinlang.org/docs/multiplatform/multiplatform-expect-actual.html)) | `expect fun` in common code, an `actual` per target; JetBrains recommends interfaces instead | Hand-edited. Permissions through third-party moko-permissions | None; the `actual` calls the platform SDK directly | **Build error** when an `actual` is missing; the only system here that fails at build time | Kotlin | Fakes behind interfaces |
| **NativeScript** ([marshalling](https://docs.nativescript.org/guide/marshalling/), [camera plugin](https://docs.nativescript.org/plugins/camera)) | Native classes called directly from JS, or `camera.takePicture()` | Hand-edited Info.plist; Android entries from the plugin | Direct runtime bindings from metadata generated off the SDK headers | `__IOS__`/`__ANDROID__` build-time branches; newer APIs throw on older devices | Generated from native headers | [unverified] |
| **Lynx** ([native modules](https://lynxjs.org/guide/use-native-modules.html), [autolink](https://lynxjs.org/next/guide/autolink.html)) | `NativeModules.X.method(args, cb)`; no built-in camera | Not documented [unverified] | Host object over JSI or Node-API; `lynx.lib.json` plus codegen | Not documented | Typed declarations or generated | [unverified] |
| **SwiftUI / Apple** ([PhotosPicker](https://developer.apple.com/documentation/photosui/photospicker), [liveUpdates](https://developer.apple.com/documentation/corelocation/cllocationupdate/liveupdates(_:)), [sensoryFeedback](https://developer.apple.com/documentation/swiftui/view/sensoryfeedback(_:trigger:)), [NSCameraUsageDescription](https://developer.apple.com/documentation/bundleresources/information-property-list/nscamerausagedescription)) | `PhotosPicker(selection:)` (no permission needed). No SwiftUI camera view: the author wraps AVFoundation. `for try await u in CLLocationUpdate.liveUpdates()`. `.sensoryFeedback(.selection, trigger: value)` | Info.plist keys "required if your app uses" the API. The app being killed when a key is missing is widely reported [unverified on Apple's page]. A privacy manifest per SDK | n/a | `@available` checked by the compiler | Swift | Simulator tooling |
| **Jetpack Compose / Android** ([TakePicture](https://developer.android.com/reference/androidx/activity/result/contract/ActivityResultContracts.TakePicture), [photo picker](https://developer.android.com/training/data-storage/shared/photopicker), [CameraX preview](https://developer.android.com/media/camera/camerax/preview), [permissions](https://developer.android.com/training/permissions/requesting)) | `rememberLauncherForActivityResult(TakePicture())` hands off to the system camera; `PickVisualMedia` needs no permission; CameraX `CameraXViewfinder`; `getCurrentLocation()` | `<uses-permission>`, plus a runtime request on API 23+; two denials mean "don't ask again" | n/a | API-level checks and lint | Typed contracts (`ActivityResultContract<Uri, Boolean>`) | `adb install -g`, permission-flag resets |

**What the survey says, in plain terms.**

1. **No one works out permissions from code.** Expo comes closest: a library brings its Android permissions with it, and its config plugin writes iOS text. Everyone else hand-edits. Android Lint's `MissingPermission` check and academic tools that map API calls to permissions (PScout, Stowaway) are the only precedents for inference. That was found in the September research and stands. **[source: earlier note T003]** Markless can infer them because its analyzer already knows, per route, which modules are reachable.
2. **Picking or taking a photo through the system needs no permission, on every platform**: PHPicker/PhotosPicker, `PickVisualMedia`, `TakePicture` (a hand-off to the camera app), and `<input capture>` on the web. Only a live camera inside the app needs camera permission. **[source]** A framework should make the system route the default.
3. **A live preview is always an element bound to a camera session**: `CameraPreview(controller)`, `PreviewView`/`CameraXViewfinder`, a wrapped `AVCaptureVideoPreviewLayer`, or `<video srcObject>`. Expo's `CameraView` plus `takePictureAsync()` on a ref is the most compact author shape. **[source]**
4. **Ongoing streams are moving to async iteration** (Swift `liveUpdates()`, Dart `Stream`), and haptics in SwiftUI react to a state change rather than an imperative call. **[source]**
5. **A permission status has more than three values.** iOS has `limited` and `restricted`; Android has "denied, don't ask again" and one-time grants. Every library names these differently (`canAskAgain`, `prompt-with-rationale`, `deniedForever`, `BLOCKED`). **[source]**
6. **Unsupported platforms are handled four ways**: at build time (KMP, NativeScript), when the module is looked up (RN `getEnforcing`), when it is called (Capacitor, Flutter, web), or with quietly reduced results (Expo web, `vibrate`). **[source]**
7. **Testing happens at three points**: mock the call boundary, drive the OS permission state (Maestro `permissions:`, Playwright `grantPermissions`), or fake the sensor (Maestro `setLocation`, Playwright `setGeolocation`). **[source]** No system ships one fake device that both web and native tests drive. That gap is an opening for Markless.

## 3. What is special about Markless

### 3.1 Which features map onto concepts Markless already has

| Feature | Kind | Existing Markless concept | New concept needed? |
|---|---|---|---|
| Take or choose a photo (system UI) | user-activated control, one-off result | `<input type="file">` element plus `onChange` | Only "a file can live in `state()` and be an `<img src>`" (3.3) |
| Live camera preview | view | an element plus `element()` handle methods (like `field?.focus()`) | A native view element contributed by a package |
| Shutter (`takePhoto`) | one-off async from a handler | handler `await` on a handle method | none |
| Photo library (system picker) | control, one-off | `<input type="file" accept="image/*" multiple>` | none |
| Current location | one-off async value | `computed(async)` inside `@try`/`@pending`/`@catch` | "device-only" fact (3.4) |
| Location updates, motion and compass sensors | stream | element events, or a shared value the host writes | A sanctioned way for a host to write state from outside a handler. The September research raised this; it is still open |
| Permission denied | error | `@catch (error)` with `error.name === 'NotAllowedError'` (only `name` and `message` survive, which is enough) | none |
| Permission status shown before asking | reactive value | `shared()` holding `state()` | Same host-write need as streams |
| Haptics | fire-and-forget | a call in a handler | none |
| Share sheet, clipboard write | one-off async from a user action | handler `await` | none |
| Biometric confirmation | one-off async | handler `await`; failure in `try`/`catch` or `@catch` | none |
| Notifications: permission, token, local schedule | one-off async, plus an incoming-tap event | handler `await`; incoming taps as a route (a deep link) | Notification taps should land on a route, which keeps routes as the one concept **[inferred]** |
| Files (save or export) | one-off async | handler `await` | Reading a file uses `<input type=file>`. There is no settled standard for "save to Files"; that part is Markless's own |
| Settings link | effect | a call in a handler | none |

Nearly everything maps onto elements, async values with `@try`/`@pending`/`@catch`, events, and state. Two things are new: **(a)** a host-written value, needed for streams and live permission status, and **(b)** a picked file as a value.

### 3.2 What the compiler can work out by itself from analyzer facts

These are all **[inferred]** proposals, grounded in facts the analyzer already produces: modules, imports and exports, bindings, references and the route graph.

1. **Permission entries and manifest lines.** The chain is: route graph, then the modules each route can reach for each target, then the device functions and elements imported or the HTML used, then each one's declaration in its package's data, then the union. Literal arguments and attributes narrow the result:
   - `accuracy: 'approximate'` means Android gets only `ACCESS_COARSE_LOCATION`.
   - `<input capture>` with `accept="video/*"` adds the microphone.
   - A value the analyzer cannot read as a literal includes the wider set, and the build says so in its report. Analysis never silently drops a permission.
   - HTML elements count too: a reachable `<input type=file capture>` is a fact like any import.
2. **Usage descriptions are never invented.** Each Info.plist usage key the build derives must have text in app config. A missing one is a build error naming the key and the route that needs it. An entry in app config that no reachable code uses is a warning, because extra permissions hurt store review.
3. **Native modules to link.** Only implementations reachable from the app's routes get linked: Swift packages and Gradle modules named in each capability's package data. This also keeps unused permission code out of the iOS binary, which App Store review checks. React Native apps do that by hand with `setup_permissions` in the Podfile. **[source: September research]**
4. **Unsupported platform.** A reachable device function whose package declares no implementation for a configured target is a **build error** that names the import chain from the route, in the style of `MARKLESS_NODE_IN_BROWSER`. A device that supports the platform but lacks the hardware (no camera) gets a runtime `NotSupportedError` in `@catch`. The author writes no platform check.
5. **Where it runs.** A device function is marked in its package data as *device-only*. Code that reads it inside `computed(async)` never runs on the server: the server sends `@pending`, and the device starts it. Today an author splits server and browser code with `import.meta.env.SSR` (website/pages/router/data.mdx). Device features need no such split, because the fact comes from the package.
6. **Handlers as data.** A handler like `onClick={() => { count++; haptic('success'); }}` is a state write plus a device effect with a literal argument. Both can be lowered to operations the native runtime runs without a JS engine. `photo = await camera.takePhoto()` is a device call followed by an assignment. Whether an `await` followed by an assignment is encodable is the same open question about which writes can be op-encoded that the September notes recorded. Device calls should be designed so they *are* encodable: plain data in and out, no callbacks.

### 3.3 Picked photos as values

A `File` is a class instance, and the async guide says not to keep class instances in `state()`. Device features return files constantly: picked photos, captures, documents. Proposal: Markless treats a host file (`File` on the web, a sandbox file reference on phones) as a value `state()` may hold.
- `<img src>`, `<video src>` and `fetch` bodies accept it directly.
- The web runtime creates the object URL and revokes it when the value changes or the element leaves.
- Phones pass a file reference to the native image view.
- Serialised payloads never carry the bytes. A resumed page shows the value as gone (`null`).

This is **Markless's own** extension: `<img src>` takes a string in HTML. It also matches the September camera notes, which said a native camera session must never be serialised. **[inferred]**

### 3.4 How the call reaches native

There is one contract per feature: plain-data inputs, a plain-data result, typed error names, and the events it can emit. The contract is typed in TypeScript in the package, and Swift and Kotlin protocols are generated from it (as with React Native Codegen and Pigeon). The native runtime calls the Swift or Kotlin implementation directly when the handler was lowered to operations, and through the JS engine only when the handler needs arbitrary logic. TypeScript is never transpiled to Swift. **[inferred]**

## 4. Three designs

Each design shows the same three examples. Examples 1 to 3 for the recommended design C are in the Summary and are not repeated.

### Design A: a typed capabilities API in the style of Expo and Capacitor

The author imports objects per feature, checks and requests permission explicitly, and calls promise-returning functions. A preview is a component.

```tsrx
// A1. Take a photo.
import { state } from '@markless/core';
import { Camera, type Photo } from '@markless/device/camera';

export default function Snap() @{
	let photo = state<Photo | null>(null);

	<main>
		<button onClick={async () => (photo = await Camera.takePhoto({ source: 'camera' }))}>Take photo</button>
		@if (photo) {
			<img src={photo.uri} alt="The photo you took" />
		}
	</main>
}
```

```tsrx
// A2. Live preview with a shutter.
import { element, state } from '@markless/core';
import { CameraView, cameraPermission, type CameraViewElement, type Photo } from '@markless/device/camera';

export default function Viewfinder() @{
	const permission = cameraPermission();
	const view = element<CameraViewElement>();
	let photo = state<Photo | null>(null);

	<main>
		@if (permission.state === 'granted') {
			<>
				<CameraView el={view} facing="back" />
				<button onClick={async () => (photo = (await view?.takePicture()) ?? null)}>Take photo</button>
			</>
		} @else if (permission.canAsk) {
			<button onClick={() => permission.request()}>Allow camera</button>
		} @else {
			<p>Camera access is off. Turn it on in Settings.</p>
		}
		@if (photo) {
			<img src={photo.uri} alt="Last photo" />
		}
	</main>
}
```

```tsrx
// A3. Location with a denied state.
import { computed } from '@markless/core';
import { Location, locationPermission, openSettings } from '@markless/device/location';

export default function Nearby() @{
	const permission = locationPermission();
	const here = computed(async () => await Location.getCurrentPosition({ accuracy: 'approximate' }));

	<main>
		@if (permission.state === 'granted') {
			@try {
				<p>{`You are near ${here.latitude.toFixed(2)}, ${here.longitude.toFixed(2)}`}</p>
			} @pending {
				<p>Finding you…</p>
			}
		} @else if (permission.canAsk) {
			<button onClick={() => permission.request()}>Use my location</button>
		} @else {
			<button onClick={() => openSettings()}>Location is off. Open Settings</button>
		}
	</main>
}
```

- **The compiler must learn:** the same derivation as in 3.2, keyed on imports. Permission status needs host-written shared values (3.1).
- **Each host supplies:** an implementation of each feature, plus a permission-status provider that updates when the app returns to the foreground.
- **Third parties:** the same package contract as C (section 5).
- **Against the rulings:** passes all of them, with no markers. It is weaker on "intent over mechanism", because the author writes the request-permission mechanism by hand every time.
- **AI agents:** familiar from Expo and Capacitor training data. Agents often skip the `canAsk` branch, or call `request()` on load, which Apple's guidelines discourage. **[inferred]**
- **Tests:** as in section 6.
- **Verdict:** workable, but it gives every author a permission state machine that the web model does not need. In A2 the permission branch is longer than the camera code.

### Design B: settled web standards only, mapped to native by the compiler

The author writes only APIs that are settled per section 1, and the compiler maps them on phones.

```tsrx
// B1. Take a photo. Settled: HTML Media Capture (W3C Recommendation 2018), File, URL.createObjectURL.
import { state } from '@markless/core';

export default function Snap() @{
	let url = state('');

	<main>
		<input type="file" accept="image/*" capture="environment"
			onChange={(event) => {
				const file = event.currentTarget.files?.[0];
				if (url) URL.revokeObjectURL(url);
				url = file ? URL.createObjectURL(file) : '';
			}} />
		@if (url) {
			<img src={url} alt="The photo you took" />
		}
	</main>
}
```

```tsrx
// B2. Live preview with a shutter. Settled: getUserMedia, <video srcObject>, canvas drawImage, toBlob.
import { element, state } from '@markless/core';
import { startCamera, grabFrame } from './camera.ts'; // the author's own helpers around the web APIs

export default function Viewfinder() @{
	const video = element<HTMLVideoElement>();
	let url = state('');
	let problem = state('');

	<main>
		<video el={video} autoplay playsinline muted
			attach={(node) => startCamera(node, (name) => (problem = name))} />
		<button onClick={async () => (url = video ? await grabFrame(video) : '')}>Take photo</button>
		@if (problem === 'NotAllowedError') {
			<p role="alert">Camera access is off.</p>
		}
		@if (url) {
			<img src={url} alt="Last photo" />
		}
	</main>
}
```

```ts
// camera.ts
export function startCamera(node: HTMLVideoElement, fail: (name: string) => void) {
	let stream: MediaStream | undefined;
	navigator.mediaDevices
		.getUserMedia({ video: { facingMode: 'environment' } })
		.then((s) => { stream = s; node.srcObject = s; })
		.catch((error: DOMException) => fail(error.name));
	return () => stream?.getTracks().forEach((track) => track.stop());
}
export async function grabFrame(node: HTMLVideoElement): Promise<string> {
	const canvas = document.createElement('canvas');
	canvas.width = node.videoWidth;
	canvas.height = node.videoHeight;
	canvas.getContext('2d')!.drawImage(node, 0, 0);
	const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg'));
	return blob ? URL.createObjectURL(blob) : '';
}
```

```tsrx
// B3. Location with a denied state. Settled: Geolocation (shipped everywhere), error code PERMISSION_DENIED.
import { computed } from '@markless/core';
import { position } from './where.ts';

export default function Nearby() @{
	const here = computed(async () => await position());

	<main>
		@try {
			<p>{`You are near ${here.latitude.toFixed(2)}, ${here.longitude.toFixed(2)}`}</p>
		} @pending {
			<p>Finding you…</p>
		} @catch (error, reset) {
			@if (error.name === 'NotAllowedError') {
				<button onClick={reset}>Location is off. Try again</button>
			} @else {
				<p>{error.message}</p>
			}
		}
	</main>
}
```

```ts
// where.ts: turns the callback API into a promise and the numeric code into a name.
export function position(): Promise<GeolocationCoordinates> {
	return new Promise((ok, fail) =>
		navigator.geolocation.getCurrentPosition(
			(p) => ok(p.coords),
			(e) => fail(Object.assign(new Error(e.message), { name: e.code === e.PERMISSION_DENIED ? 'NotAllowedError' : 'PositionError' })),
		),
	);
}
```

- **Coverage:** the settled standards cover all three examples on the web. Nothing outside the examples is covered: haptics (Safari has no `vibrate`), biometrics, notifications on iOS outside Home Screen apps, sensors, saving files, and any "open Settings" link.
- **The compiler must learn:** to recognise imperative DOM code on phones. In B2 that means `getUserMedia` inside an `attach`, assigned to `srcObject`, plus a detached canvas `drawImage`/`toBlob`, mapped to AVFoundation or CameraX. That is pattern-matching mechanism, not reading intent, and it is fragile: `grabFrame` could be written ten ways. The alternative is shipping a JS engine plus a fake DOM for canvas, video and `navigator` on phones, which breaks "a JS engine only where truly needed". Globals (`navigator.*`) also have no import for the analyzer to follow. Reachability would key on member reads of a global, which works for literal `navigator.geolocation` but not for aliases. **[inferred]**
- **Each host supplies:** a native implementation of every web API it claims, with web semantics (callback timing, `DOMException` names), even where the native API differs. One example: a canvas frame grab is not a camera photo.
- **Third parties:** cannot add a global without patching types and the compiler. No clean extension path.
- **Against the rulings:** no markers, so it passes the letter. It fails "intent over mechanism" on phones, and pushes toward a JS engine everywhere. Location on the server: `navigator` doesn't exist in SSR, so without a device-only fact the author must split the code with `import.meta.env.SSR`, which is exactly the "says where code runs" problem.
- **AI agents:** the best first guess on the web, since agents know these APIs cold. They fail on phones in ways they cannot predict: a helper written slightly differently stops being recognised.
- **Tests:** Playwright covers the web fully. Native tests depend on the pattern recogniser.
- **Verdict:** keep as a principle for what is truly declarative HTML (`<input capture>`, `<video>`, `<img>`), not as the overall answer.

### Design C (recommended): settled HTML for declarative things, Markless's own typed functions and elements for the rest

The examples are in the Summary. The rules an author or agent follows:

1. **If settled HTML already says it, write the HTML.** `<input type="file" accept capture multiple>` for taking or choosing photos and files, `<img>`/`<video>` for showing them, `<a href="tel:…">`/`mailto:`. These lower on phones to PHPicker / `UIImagePickerController` and Android `PickVisualMedia` / `TakePicture`, which need no permission on Android. **[source for the platform pickers; the lowering is inferred]**
2. **If it shows on screen and HTML does not settle it, use an element from `@markless/device`**: `<Camera>`, later `<Map>` or `<Scanner>`. You reach it through an `element()` handle and call its methods from handlers. The shape follows Expo `CameraView`, Flutter `CameraPreview` and CameraX `PreviewView`.
3. **If it is a one-off answer, it is an async function from `@markless/device`.** `await` it in a handler, or read it in `computed(async)` inside `@try`. Names and errors follow the web where the meaning matches: `share(data)` takes `navigator.share`'s data shape, `writeText`, and `NotAllowedError`/`NotSupportedError`/`AbortError`. Otherwise the name is Markless's own: `currentPosition` (promise-shaped, unlike the callback API), `authenticate({ reason })`, `openSettings()`.
4. **If it is fire-and-forget, call it**: `haptic('success')`. On the web it uses `navigator.vibrate` where it exists, and does nothing on Safari.
5. **Never write a permission request.** Calling the feature asks, as on the web. A refusal is `NotAllowedError` in `@catch` or `catch`. When the user returns from Settings, async values that failed with `NotAllowedError` reload once, the same way Markless already reloads async values after a save. **[inferred: proposed behaviour]** A status read *before* asking (to show an explanation first) is an opt-in shared value: `const camera = cameraAccess()` holding `{ state: 'prompt' | 'granted' | 'denied' | 'limited', canAsk }`.
6. **Never write a platform check.** A missing implementation is a build error; missing hardware is `NotSupportedError` at runtime.

- **The compiler must learn:** everything in 3.2 (derived permissions, usage-text errors, linking, unsupported-target errors, the device-only fact keeping work off the server), plus lowering device calls in handlers to operations. Some of this is also new outside the compiler: the `File`-as-value rule (3.3) is a runtime and serializer change, and the host-written value (3.1) is a runtime seam.
- **Each host supplies:**
  - **Web:** thin modules over settled APIs, plus code for features with no settled standard. For example, `<Camera>`'s `takePhoto` uses `ImageCapture` where present and a canvas frame otherwise.
  - **iOS:** AVFoundation, CoreLocation, `UIImpactFeedbackGenerator`, LocalAuthentication, `UIActivityViewController`, PHPicker.
  - **Android:** CameraX, FusedLocation, `HapticFeedback`, BiometricPrompt, the share intent, the photo picker and activity-result contracts.
  - **Every host:** a test fake (section 6).
- **Third parties:** section 5.
- **Against the rulings:**
  - No per-platform markers or branches: none appear; unsupported targets are build errors.
  - No sigils: the API is ordinary imports.
  - Nothing says where code runs: device-only is a package fact the compiler reads.
  - No transpiling: the native side is implemented natively, and Swift and Kotlin protocols are generated from the TS contract (types only).
  - Handlers as data: device calls take plain data and are designed to be encodable as operations.
  - Routes stay the one concept: notification taps and deep links open routes.
  - Real platform views: `<Camera>` is an `AVCaptureVideoPreviewLayer` or a `PreviewView`.
  - Intent over mechanism: the author never writes permission requests, object-URL bookkeeping or manifest edits.
- **AI agents:** the six rules fit on one page (proposed `packages/core/agent/device.md`, alongside `async.md`). Most of what an agent writes is HTML or async code it already knows: `<input capture>`, `computed(async)`, `@catch` with `NotAllowedError`. The typed package catches wrong calls as type errors. The build errors come with a "write instead" line, like the table in `async.md`. The most likely first-try mistake is writing `navigator.geolocation` directly. A build diagnostic should catch a `navigator.*` device API reached from a route that targets phones and point to the `@markless/device` function. The fact comes from the analyzer's reference to a global, not from a text search. **[inferred]**
- **Tests:** section 6.

### A design considered and rejected: listing capabilities per route

Tauri makes the app grant permission identifiers in `capabilities/*.json`. A Markless version would have each route list the features it uses. That is a second source of truth for a fact the analyzer already has, and it adds a second concept beside routes. Rejected. **[inferred]**

## 5. How a third party adds a feature Markless does not ship

This builds on the September extension research and is unchanged in spirit: **no library ever patches the compiler or adds syntax.** A device package ships:

1. **A typed TS contract.** Functions and elements, plain-data inputs and outputs, error names and events. The compiler checks it, and generates Swift and Kotlin protocols from it.
2. **Package data in `package.json`** under `markless`. For each export: whether it is device-only, and its permissions and plist keys per platform (with how literal options narrow them). For each target: an implementation path (`swiftPackage`, `gradle`, `web` module), or `false`. This is data, never build code. The precedents are `lynx.lib.json`, `expo-module.config.json`, Android library manifest merging and Xcode privacy-manifest aggregation. Expo-style config plugins (arbitrary JS that rewrites native files) stay rejected.
3. **Swift, Kotlin and web implementations**, plus each one's test fake.

```jsonc
// package.json of a third-party NFC package (field names are proposals)
{
	"markless": {
		"device": {
			"readTag": {
				"deviceOnly": true,
				"ios": { "infoPlist": ["NFCReaderUsageDescription"], "entitlements": { "com.apple.developer.nfc.readersession.formats": ["TAG"] } },
				"android": { "permissions": ["android.permission.NFC"], "features": [{ "name": "android.hardware.nfc", "required": false }] }
			}
		},
		"targets": { "ios": { "swiftPackage": "native/ios" }, "android": { "gradle": "native/android" }, "web": false }
	}
}
```

The app author imports `readTag` like a first-party function, and writes its usage text in app config. A route that reaches `readTag` in a web build gets a build error naming the import chain, because the package declares `"web": false`. Anything a fixed schema can't express (an app extension target, unusual Gradle setup) is handled by first-party code first. The schema grows by your decision, not by plugin code. **[inferred]**

## 6. Testing

- **Web (Playwright)** **[source]**:
  - `context.grantPermissions([...])` to allow a feature; leaving it out exercises denial.
  - `context.setGeolocation({ latitude, longitude })`, or `null` for an unavailable position.
  - `page.setInputFiles()` for `<input type=file>`.
  - Chromium `--use-file-for-fake-video-capture=<file>` for a known camera image (webrtc.org testing docs). `--use-fake-device-for-media-stream` is widely used but was not on a primary page **[unverified]**.
  - ([BrowserContext](https://playwright.dev/docs/api/class-browsercontext), [webrtc testing](https://webrtc.org/getting-started/testing))
- **Native (Maestro)** **[source]**:
  - `launchApp: permissions: { all: deny }` or per feature (`camera`, `location`, `photos: limited` on iOS). Maestro allows everything by default.
  - `setLocation: { latitude, longitude }` (Android needs API 31+).
  - `clearState: true` resets the app.
  - ([launchApp](https://docs.maestro.dev/api-reference/commands/launchapp), [permissions](https://docs.maestro.dev/advanced/configuring-permissions), [setLocation](https://docs.maestro.dev/api-reference/commands/setlocation))
- **The gap Markless can close: one fake device.** The iOS Simulator has no real camera **[inferred; widely known, not checked]**, so a live-camera test needs a host fake. Each host's test build replaces each device function with a fake driven by the same fixture file (images to return for camera captures, positions, permission answers). The same fixture drives Playwright on the web and Maestro on phones, so the three examples get one scenario each that runs on all three targets. The analyzer's build report lists which features each route reaches, so a test plan can check that each one has a scenario, granted and denied. **[inferred]**
- **Build-time tests:** snapshot the derived Info.plist keys and manifest entries for a fixture app. Assert the build fails with the exact key when usage text is missing, and fails with the import chain when a target has no implementation. These run in the normal unit suite, with no device needed. **[inferred]**

## 7. Recommendation and what would change it

**Recommend design C.** It is the only design that covers the whole feature list, not just the three examples. It keeps every ruling. It turns the parts the author hates in every other ecosystem (permission requests, plist and manifest editing, linking) into facts the compiler derives. It also uses settled HTML exactly where HTML is settled, so most of what an author or agent writes is already familiar.

**What would change my mind:**

1. **WebKit and Mozilla ship the capability elements.** If `<geolocation>` and `<camera>` become settled, examples 2 and 3 should switch to those tags, and design C's own `<Camera>` should become a thin alias for them. That would push C toward B.
2. **Op-encoding can't handle an `await` on a device call followed by an assignment.** Then every handler using the camera boots the JS engine on phones. Design C still works, but loses part of its native-performance argument. The fix would be a different call shape (for example, the element writing its result into a bound state value), not a different design.
3. **Store reviewers object to inferred permissions** (for example, flagging an approximate-only location app because of how keys are worded). Then the compiler should derive a *proposal* and require app config to confirm each entry, which is closer to Tauri's explicit grants.
4. **Your sibling native-targets proof finds that a host-written value is too costly in the graph.** Then streams and live permission status would move to element events only.

## 8. Decisions only you can make

**Overall shape:** settled HTML where it exists plus Markless's own `@markless/device` package, rather than a web-standards-only design or an Expo-style permission API. I recommend this because it covers the whole feature list and never asks the author to write a permission request.

**Package name:** `@markless/device`, a new curated package, rather than putting device features inside `@markless/core`. I recommend the separate package because device features carry native code and package data that most web apps never need. The platform spec also forbids `native` as a package name, and `device` avoids it.

**Where permission text lives:** app config, with a build error naming the missing key, rather than defaults shipped by each package. I recommend app config because Apple rejects generic text, and a missing key is reported to crash the app on first use.

**Picked files as values:** allow `state()` to hold a picked or captured file, and `<img src>` to accept it, rather than making authors manage object URLs. I recommend allowing it because the runtime can create and release the URL correctly every time, and phones need a file reference anyway.

**Device-only work and the server:** the compiler keeps device features off the server (it shows `@pending`, then the device runs the work), driven by a package fact rather than an author marker. I recommend this because it is the "compiler decides where code runs" ruling applied directly.

**Automatic reload after Settings:** when the app returns from Settings, async values that failed with "not allowed" load once more by themselves. I recommend this because it matches how Markless already reloads after a save, and removes a common bug where the screen stays stuck on "denied".

**Chrome's capability elements:** don't build on `<geolocation>` or `<usermedia>` now, and keep those tag names free. I recommend waiting because only Chrome ships them and WebKit has open API-design concerns.

Researched defaults, which I'd go ahead with unless you say otherwise:
- Web error names (`NotAllowedError`, `NotSupportedError`, `AbortError`) everywhere.
- Haptics are a silent no-op on Safari.
- Notification taps open a route.
- The test fake device described in section 6.
- No per-route capability lists.
