1:
- `shared` (from `@markless/core`): wraps a factory so that every call to `readingList()` gets the same object. Here it makes one reading list that the whole app shares, not one per component. Guess: the instance is created the first time it is called. I'm unsure whether `{ ...box }` keeps `ids` reactive. I'm assuming Markless keeps assignments to `list.ids` live, but the spread looks like it could copy a plain snapshot.
- `state`: a reactive value. Here it holds `{ ids: [] }`, the reading list's article IDs.
- `storage`: a persisted value under the key `'text-size'`, with a default of `'normal'`. Assigning to the `let` variable writes it back to storage. Guess: it is stored per device or browser (localStorage-like, or maybe a cookie), so it survives reloads.
- `location`: a live device-geolocation object. It exposes `access` (permission state, for example `'denied'`) and `position` (latitude and longitude, empty until known). Guess: calling it may trigger the location permission prompt.
- `network`: a live connectivity object. `net.online` drives the "You are offline" banner.
- `notifications`: device notifications. `schedule()` queues a local notification for a given time, with a title and a `url`. Guess: the `url` is opened when the person taps the notification.
- `settings`: the OS settings app. `settings.open()` jumps to this app's settings page (guess: the app's permissions page specifically).
- `sharesheet`: the native share sheet. `open({ title, url })` opens the system share UI already filled with the article.

2:
- "Text size": toggles `textSize` between `'normal'` and `'large'`. The `<article>` class changes, and the choice is saved. The same person on this device sees it, including in other Articles and on later visits. Nobody else sees it. Guess: that depends on how `storage` persists.
- "Save for later": adds this article's id to the shared reading list. Any other component in this app session that calls `readingList()` sees the updated list. It doesn't appear to be persisted or synced, so it is gone on reload and other people don't see it (guess).
- "Share": opens the phone's share sheet with the title and URL. Whoever the person picks (a contact or an app) receives the link.
- "Remind me in an hour": schedules a local notification, "Read <title>", one hour from now. Only this person, on this device, sees it, presumably even if the app is closed. Tapping it probably opens the url.
- "Turn on location in Settings": shown only when location access is denied. It leaves the app for the OS settings screen. Only the person sees this. Guess: after they enable location and come back, `here.access` and `here.position` update and the "Reading near …" line appears.

3: Several names look like existing ones:
- `location` looks like the browser's `window.location`, the page URL. This was the one that made me pause: at first glance it could mean navigation, and only `.access` and `.position` show it is geolocation.
- `network` resembles `navigator.onLine` or the Network Information API.
- `notifications` resembles the browser `Notification` API, though `schedule` with `at` reads like native local notifications.
- `sharesheet` resembles `navigator.share`.
- `storage` resembles `localStorage` / Web Storage, which left me unsure where it persists.
- `shared` resembles `SharedWorker` or `SharedArrayBuffer` by name only, and its spread-of-state pattern made me unsure about reactivity.
- `settings` is generic but clear from use.

Overall, the usage made each one fairly clear. The `location` name clash with `window.location` is the main source of doubt.

Tools used: none
