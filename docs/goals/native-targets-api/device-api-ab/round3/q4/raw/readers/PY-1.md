1:
- `shared`: from Markless. It wraps a factory so the value is created once and every caller of `readingList()` gets the same object. Here that makes the reading list app-wide. Guess: it is shared in memory within this app session, not across devices or users.
- `state`: from Markless. It makes a reactive value, so assigning to it updates the page. Here it holds `{ ids: [] }`. Guess and possible problem: `{ ...box }` copies `ids` into a plain object. If spreading drops reactivity, `list.ids = ...` would not update other readers. I can't tell from the code alone.
- `storage`: from Markless. It is a persisted value under the key `'text-size'`, defaulting to `'normal'`. Assigning to the `let` writes it back. Guess: it is stored on this device or browser, survives reloads, and other `storage('text-size')` users stay in sync.
- `location`: from the device package. Calling it gives a reactive geolocation handle with `access` (permission state, e.g. `'denied'`) and `position` (`latitude`/`longitude`). Guess: calling it may trigger the permission prompt.
- `network`: from the device package. It is a reactive connectivity handle. `net.online` drives the "You are offline" banner.
- `notifications`: from the device package. `schedule()` books a local notification on the phone with a title, a time and a `url`. Guess: tapping it opens the `url`.
- `settings`: from the device package. `open()` jumps to the phone's system Settings, probably this app's page, so the person can turn location permission back on.
- `sharesheet`: from the device package. `open({ title, url })` shows the phone's native share sheet.

2:
- "Text size": switches the stored value between `'normal'` and `'large'`. The article's class changes, so the text resizes, and the choice is remembered on this device. Only this person sees it. Guess: other Articles on the same device follow it too, but no other users do.
- "Save for later": adds this article's `id` to the shared reading list. Nothing stops the same id being added twice. Other components in this app that call `readingList()` see it, for example a reading-list screen, assuming the spread above stays reactive. No other users or devices see it. Guess: it is lost on reload, since it isn't in `storage`.
- "Share": opens the native share sheet with the title and URL. Whoever the person picks (a messaging contact, email, etc.) receives the link.
- "Remind me in an hour": schedules a local notification "Read <title>" for one hour from now. Only this person, on this phone, sees it. Guess: it may ask for notification permission first, and nothing in the code handles a refusal.
- "Turn on location in Settings": this button only appears when location access is denied. It opens the system Settings app. Only this person sees that. Guess: if they allow location and come back, `here.access` and `here.position` update and the "Reading near ..." line shows coordinates. Those coordinates appear only on their own screen.

3:
- `location` clashes with the browser's `window.location`, the page URL object. Importing it hides that global, and `location()` being a function rather than an object made me stop to work out which one it was. `here.position.latitude` also differs from the browser's `GeolocationPosition`, where it is `coords.latitude`.
- `network.online` resembles the browser's `navigator.onLine`.
- `notifications` resembles the Web `Notification` API.
- `sharesheet` resembles the browser's `navigator.share` and the iOS share sheet.
- `storage` resembles `localStorage`, and could also be read as the device's disk storage.
- `shared` resembles `SharedWorker` or shared-state utilities from other frameworks.
- `settings` is generic, so it could mean app settings rather than the OS Settings app. The button label makes it clear it means OS Settings.

Only `location` caused real doubt. The rest read clearly from context.

Tools used: none (apart from the one Read that delivered these instructions)
