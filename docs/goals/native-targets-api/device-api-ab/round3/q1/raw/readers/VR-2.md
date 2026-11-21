1a: They see the text "The camera works in the app." There is no camera view and no Take photo button, because `platform.ios || platform.android` is false on the website.

1b: They see "Location works in the app." The page never shows a position or asks for location permission. I am assuming `geolocation()` does nothing until something reads it, so creating it at the top does not trigger a browser prompt. That is a guess.

1c: The Like button shows "Like (0)", and each click adds one to the count. `haptics.tap('light')` should do nothing on a laptop, since it has no haptic hardware. I am guessing it does nothing quietly rather than throwing an error. If it threw, the count would still go up, because `likes++` runs first.

1d: Nothing appears. The banner only shows in the iPhone and Android apps, so a dropped connection shows no banner on the website.

1e: There is no Share button. It only renders in the iPhone and Android apps.

1f: My guess is "Press Ctrl+K to search". I read `platform.macos` as "this is the Mac app build", which would be false on the website even on a Mac. If `platform.macos` instead detects the visitor's operating system, it would show "⌘K". The code does not settle this. Either way, the hint is plain text, and nothing on this page handles the key.

2a: They see a live camera view and a "Take photo" button. The button is greyed out until `cam.ready` is true. Pressing it takes a photo and shows it below as "Last photo". The first use probably asks for camera permission, which is a guess.

2b: The section shows "Finding you…" until a position arrives, then "You are at <latitude>, <longitude>" to 4 decimal places. If they deny location access, it shows "Location access is off." The first use probably asks for permission, which is a guess.

2c: Each tap adds one to "Like (n)" and plays a light haptic tap.

2d: If the connection drops, "You are offline" appears at the top as a status message, and it disappears when the connection returns. I am assuming `net.online` updates live.

2e: A Share button appears. Tapping it opens the iOS share sheet with the page title and URL.

2f: "Press Ctrl+K to search". This is accurate wording but not useful on a phone. It is not ⌘K, because `platform.macos` is false on iPhone.

3: Two cases. The website and the Mac app have no Take photo or Share buttons, so nothing dead there. The camera button only does nothing on iPhone and Android while it is disabled (`!cam.ready`), or if camera permission is refused. That second part is a guess.

The Like haptic does nothing on the website and the Mac app, but the count still goes up, so the button is not dead.

The ⌘K/Ctrl+K hint is not a button. Still, nothing on this page makes the shortcut work in any build, unless it is handled somewhere else.

4: Lines that run only in some builds:

iPhone and Android only: `<p role="status">You are offline</p>`, when offline.

iPhone and Android only: the camera section, `<base.camera el={cam} />`, the `Take photo` button, and `<img src={photo.url} alt="Last photo" />`.

Website and Mac app only: `<p>The camera works in the app.</p>`.

iPhone and Android only: the location section, `You are offline`/`Location access is off.`/`` `You are at ${...}` ``/`Finding you…`.

Website and Mac app only: `<p>Location works in the app.</p>`.

iPhone and Android only: `<button onClick={() => sharesheet.open({ title, url })}>Share</button>`.

Mac app only, plus maybe the website on a Mac: the `'⌘K'` choice in `platform.macos ? '⌘K' : 'Ctrl+K'`. Every other build gets `'Ctrl+K'`.

These lines run in every build, but their effect varies: `camera()`, `geolocation()` and `network()` at the top, and `haptics.tap('light')`. My guess is that these do nothing on platforms without the feature.

I can't tell whether these branches are removed at build time or only hidden at runtime.

5: My confidence is 3 out of 5. To be sure, I would need to know:

- whether `platform.macos` means the Mac app build or a Mac operating system, including in a browser
- whether `platform.*` values are fixed when the app is built, so code can be removed per build, or detected at runtime
- whether `camera()` and `geolocation()` ask for permission as soon as they are created, even if their output is never shown
- what `haptics`, `camera()`, `geolocation()` and `network()` do on the website: nothing, or an error

Tools used: none
