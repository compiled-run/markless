1:
- `shared`: from Markless core. It wraps a factory so that one instance is shared app-wide. Every call to `readingList()` returns the same object, so every component sees the same reading list. I'm guessing it means one per app on this device, not shared between users.
- `state`: from Markless core. It creates a reactive object `{ ids: [] }`, so assigning `ids` updates the page. One concern, which is a guess: `{ ...box }` copies the properties into a plain object, and I can't tell whether reactivity survives that copy.
- `storage`: from Markless core. It is a persisted value under the key `'text-size'` with the default `'normal'`. It is bound with `let`, so assigning `textSize` saves it and re-renders. My guess is that it lasts across reloads on this device.
- `location`: from the device package. Calling `location()` gives a reactive geolocation object with `access` (permission state, e.g. `'denied'`) and `position` (latitude/longitude, empty until known). It is used to show "Reading near …". It is not the page URL. I'm guessing that calling it asks for location permission.
- `network`: from the device package. Calling `network()` gives reactive connectivity status, and `online` drives the "You are offline" banner.
- `notifications`: a device object (not called like a function). `schedule()` sets up a local notification on the phone for a set time. My guess is that tapping it opens `url`.
- `settings`: a device object. `open()` jumps to this app's page in the phone's system Settings so the person can change permissions.
- `share`: a device object. `open()` shows the phone's native share sheet filled in with the title and URL.

2:
- "Text size": switches between `normal` and `large`, which changes the `<article>` class and saves the choice. Only this person on this device sees it, in this article and any other component reading `'text-size'`. I'm guessing it stays after a restart.
- "Save for later": adds this article's id to the shared reading list. Any other component in the app that uses `readingList()` (for example a reading-list screen) sees it, but only on this device. No other user sees it, and I'm guessing it is lost when the app restarts because it uses `state`, not `storage`. If the spread breaks reactivity, the other views might not update.
- "Share": opens the system share sheet. Whoever the person picks (a contact, another app) receives the title and link.
- "Remind me in an hour": schedules a phone notification "Read <title>" for one hour from now. Only this person sees it, on this device. My guess is that tapping it opens the article URL. It probably needs notification permission, which the code doesn't handle.
- "Turn on location in Settings": only shown when location access was denied. It opens the OS settings for this app, and only this person sees it. When they come back with access granted, I'd expect `here.position` to fill in and the coordinates line to appear. That is a guess.

3: `location` looks like the browser's `window.location` (the page URL). At first glance I wondered if it was about navigation, but `here.access` and `here.position.latitude` make it clearly geolocation. `share` resembles `navigator.share`, `notifications` resembles the web `Notification` API, and `network().online` resembles `navigator.onLine`. These matched what I expected, so they didn't confuse me. `settings.open()` is generic, and I'm guessing it means OS app settings, not in-app settings. The `{ ...box }` spread around `state()` made me unsure whether the shared reading list stays reactive.

Tools used: none
