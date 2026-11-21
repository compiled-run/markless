1a: This is a guess. I expect the `<Shooter />` boundary to fail on the website, so the visitor would see "The camera works in the app." with no camera view and no Take photo button. The catch message suggests the author expects `camera()` to throw in a browser. If it doesn't throw, they would see a live preview from the Mac's webcam (after a permission prompt) and a Take photo button. That button stays disabled until `cam.ready` is true. Pressing it would show the photo below as "Last photo".

1b: Same reasoning, also a guess: probably "Location works in the app." If `geolocation()` does work in the browser, they first see "Finding you…". Then they see either "You are at <lat>, <long>" to 4 decimal places, or "Location access is off." if they deny permission. No button is involved.

1c: The button shows "Like (0)". Each click adds 1 to the count. `haptics.tap('light')` either does nothing or throws on a Mac browser, and any error is silently swallowed, so the count still goes up and nothing is felt.

1d: Nothing shows while they are online. When the connection drops, "You are offline" appears (as a status message) and disappears when it comes back. I'm guessing that `network()` works on the web, since browsers have online/offline events. If it threw, the empty catch would show nothing at all, so there would be no banner even when offline.

1e: If the browser supports the share sheet (Safari on Mac does), the system share panel opens with the title and URL. If it is unsupported, or the user cancels and that counts as an error, "Sharing works in the app." appears under the button. Which of these happens is a guess.

1f: "Press ⌘K to search". I assume `modifierKey` is '⌘' on a Mac.

2a: A live camera preview with a Take photo button. The button is disabled until the camera is ready, and until the user grants camera permission. Tapping it takes a photo and shows it as "Last photo". Each new photo replaces the last.

2b: "Finding you…", then "You are at <lat>, <long>", or "Location access is off." if permission is denied.

2c: The count goes up and the phone gives a light haptic tap.

2d: Same as the website: "You are offline" appears while the connection is down.

2e: The iOS share sheet opens with the title and URL. If the user cancels and that is treated as an error, the "Sharing works in the app." note may appear, which would be wrong inside the app. That is a guess.

2f: Probably "Press Ctrl+K to search", because `modifierKey` is presumably not '⌘' on iPhone (it may be undefined or something else). That hint is meaningless on a phone without a keyboard. This is a guess.

3: Take photo does nothing for anyone whose camera never becomes ready, for example after denying permission. It just stays disabled, with no message explaining why. Like always increases the count, but its haptic part does nothing on the website, the Mac app and likely some Android devices, and failures are hidden. Share never does nothing: it either opens the share sheet or shows the note. The exception is a cancelled share if cancelling counts as success, which is a guess.

4: Nothing in the code is conditional on the build, so every line is in every build. Which branches run depends on where the page is running. These lines probably run only on the website (and maybe in the Mac app):
`<p>The camera works in the app.</p>`
`<p>Location works in the app.</p>`
`shareNote = 'Sharing works in the app.';`
`'⌘K'` is chosen only on Mac, both the Mac app and a Mac browser. `'Ctrl+K'` is chosen everywhere else.
`<base.camera el={cam} />`, the Take photo button and the location text probably render only in the iPhone and Android apps (and maybe the Mac app). Whether the empty catch `<></>` ever runs is unknown. Whether `haptics.tap` actually fires anything only in the iPhone and Android apps is also a guess.

5: 2 out of 5. To be sure, I would need to know four things. First, which `@markless/device` functions throw on the web (camera, geolocation, network, sharesheet), and whether they throw when called or later when used. Second, whether `haptics.tap` throws or does nothing quietly when unsupported. Third, what `modifierKey` is on each platform. Fourth, whether cancelling the share sheet rejects the promise.

Tools used: none
