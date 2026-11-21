1a: I'm guessing here. The fallback text "The camera works in the app." suggests `camera.supported` is false in the website build, so the visitor sees only that sentence. They get no camera view and no Take photo button, even though the laptop has a webcam. If `supported` is actually checked at runtime against the browser, they would instead see the camera view and a disabled Take photo button. The button would turn on once `cam.ready` is true, probably after the browser asks for camera permission. Pressing it would then show the photo under the button as "Last photo".

1b: Also a guess. "Location works in the app." suggests `geolocation.supported` is false on the web, so they see only that sentence. If it is a runtime check, they would see "Finding you…" while the browser asks for permission. After that they would see either "You are at <lat>, <lng>" to 4 decimal places or "Location access is off." if they say no.

1c: They see "Like (0)". Each click adds one to the count. `haptics.tap('light')` has nothing to vibrate on a laptop browser, so I assume it silently does nothing rather than throwing an error.

1d: If `network.supported` is true on the web (the browser can report online and offline), "You are offline" appears when the connection drops and goes away when it returns. If it is false, there is never a banner. I lean towards it appearing.

1e: The Share button only appears if `sharesheet.supported` is true. A browser's built-in share feature exists in Safari on the Mac but not everywhere, so I'm guessing. If it appears, clicking it opens the system share sheet with the title and URL. If not, there is no button.

1f: "Press ⌘K to search", assuming `modifierKey` comes out as '⌘' on a Mac. A Windows or Linux visitor would see "Press Ctrl+K to search".

2a: The camera view and a Take photo button. The button stays disabled until the camera is ready, probably after iOS asks for camera permission. Pressing it takes a photo, which then appears below as "Last photo".

2b: "Finding you…" while iOS asks for location permission. Then "You are at <lat>, <lng>", or "Location access is off." if permission is denied.

2c: "Like (n)". Each tap adds one and gives a light haptic tap.

2d: "You are offline" appears at the top when the phone loses its connection and goes away when it reconnects.

2e: A Share button. Tapping it opens the iOS share sheet with the title and URL.

2f: A guess, because an iPhone usually has no keyboard. If `modifierKey` is '⌘' (iOS uses Command for hardware keyboards), it shows "Press ⌘K to search". If it is something else or null, it shows "Press Ctrl+K to search", which is misleading. The hint is shown whether or not a keyboard is attached.

3: No button is fully dead. Take photo can't be pressed while disabled, and it is not shown at all where the camera is unsupported. Share is hidden where unsupported. The one partial no-op is Like: the count still goes up everywhere, but the haptic tap does nothing in the website build (including on phones without vibration support, such as iPhone Safari), on the Mac app, and on any device without a vibration motor.

4: These lines only render, and their handlers only run, where the matching `supported` flag is true. I can't tell from the code whether they are removed at build time or just skipped at runtime.

`@if (network.supported && !net.online) { <p role="status">You are offline</p> }`: probably all builds, including the web.

`@if (camera.supported) { … <base.camera el={cam} /> … <button … cam.takePhoto() …>Take photo</button> … }`: the iPhone, Android and Mac apps.

`} @else { <p>The camera works in the app.</p> }`: the website only.

`@if (geolocation.supported) { … here.access … here.position … }`: the iPhone, Android and Mac apps.

`} @else { <p>Location works in the app.</p> }`: the website only.

`@if (sharesheet.supported) { <button onClick={() => sharesheet.open({ title, url })}>Share</button> }`: the iPhone, Android and Mac apps, and possibly browsers that have a share feature.

`haptics.tap('light')` has an effect only on the phone apps (iPhone and Android).

`const cam = camera(); const here = geolocation(); const net = network();` run in every build. On unsupported builds they presumably return inert objects.

5: 2 out of 5. To be sure, I would need to know:

- whether `.supported` is fixed per build or checked against the actual browser at runtime;
- whether the web build supports camera, location, network status and sharing at all;
- what `modifierKey` returns on the web and on iPhone;
- whether `haptics.tap` silently does nothing or throws where it is unsupported;
- when permission prompts appear.

Tools used: none
