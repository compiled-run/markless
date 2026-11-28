1a: They see the line "The camera works in the app." There is no camera view and no Take photo button, because `platform.ios || platform.android` is false on the website. I am assuming the website counts as neither ios nor android.

1b: They see "Location works in the app." The site does not ask for location.

1c: They see "Like (0)". Each click adds 1 to the count. `haptics.tap('light')` most likely does nothing, since a laptop browser has no vibration motor. That is a guess: it could also throw an error or vibrate where the browser supports it, but it probably fails silently.

1d: Nothing is shown. The offline banner is limited to iOS and Android, so the page stays the same when the connection drops, apart from any browser error once the user tries to reach the network.

1e: There is no Share button; it is only rendered on iOS and Android.

1f: My guess is "Press Ctrl+K to search". `platform.macos` reads like "this is the Mac app build", not "the visitor's computer is a Mac", so a browser on a Mac probably gets the Ctrl+K text, which is the wrong hint for a Mac user. If `platform.macos` actually checks the visitor's operating system, they would see ⌘K instead.

2a: They see a live camera view and a Take photo button. The button stays disabled until `cam.ready` is true, which probably means after the camera permission is granted and the camera has started. Pressing it takes a photo, and that photo then appears below as "Last photo". Each new photo replaces the previous one. If camera permission is denied, the button probably stays disabled for good (a guess).

2b: The app probably asks for location permission (a guess about when it asks). While waiting it shows "Finding you…", then "You are at <latitude>, <longitude>" to 4 decimal places, which presumably updates as the user moves. If access is denied, it shows "Location access is off."

2c: Each tap adds 1 to the Like count and plays a light haptic tap.

2d: When the connection drops, "You are offline" appears at the top. It disappears when the connection comes back, assuming `net.online` updates live.

2e: A Share button appears. Pressing it opens the iOS share sheet with the page title and URL.

2f: "Press Ctrl+K to search". iOS is not macos, so the phone gets the Ctrl+K text, which means little on a phone with no keyboard.

3: No button is fully dead. The haptic part of Like does nothing on the website and probably also in the Mac app, but the count still goes up. Take photo is disabled, not silently broken, while the camera is not ready or if permission is denied (iPhone and Android). The buttons that would do nothing on the website and the Mac app are not rendered there at all.

4: I am guessing that the `platform.*` checks are fixed when each build is made, so the branches for other builds are dropped from that build.
- `<p role="status">You are offline</p>`: iOS and Android only. The `network()` setup may still run in every build.
- `<base.camera el={cam} />`, the Take photo button and `<img src={photo.url} …>`: iOS and Android only.
- `<p>The camera works in the app.</p>` and `<p>Location works in the app.</p>`: Mac app and website.
- The whole location section (`here.access === 'denied'`, `here.position`, "Finding you…"): iOS and Android only.
- `<button onClick={() => sharesheet.open({ title, url })}>Share</button>`: iOS and Android only.
- `'⌘K'` appears only in the Mac app; `'Ctrl+K'` appears everywhere else (iOS, Android, website).
- `haptics.tap('light')` runs in every build, but probably only has an effect on iOS and Android.
- `camera()`, `geolocation()` and `network()` are called in every build. It is unclear whether they do anything, or ask for permission, on the website and in the Mac app.

5: 3 out of 5. To be sure I would need to know:
- whether `platform.macos` means the Mac app build or any Mac, including a browser on a Mac;
- whether the website counts as some platform value (for example `platform.web`) and never ios or android;
- what `haptics.tap` does where there is no vibration hardware;
- whether `camera()` and `geolocation()` ask for permission, or fail, when called on the web.

Tools used: none
