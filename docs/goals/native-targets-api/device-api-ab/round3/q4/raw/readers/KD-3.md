1:
- `shared`: Markless helper that creates one instance shared app-wide. Every component that calls `readingList()` gets the same reading list. The first call runs the factory. I'm guessing that it is lazy and a singleton per app or session.
- `state`: Markless reactive value. Assigning to it, for example `list.ids = ...`, updates the page. Here it holds `{ ids: [] }`. I'm unsure about `{ ...box }`: a plain spread might copy the current values and lose reactivity. I assume Markless keeps the properties live, but that is a guess.
- `storage`: Markless value that persists on the device under the key `'text-size'`, with `'normal'` as the default. Assigning to it saves the new value and re-renders. Here it is used as the article's CSS class. I'm guessing at the storage backend: localStorage or a cookie.
- `location`: device geolocation. `location()` returns a reactive object with `access` (permission state, for example `'denied'`) and `position` (latitude and longitude once known). I'm guessing that calling it asks for permission and starts tracking the position.
- `network`: device connectivity. `network()` returns a reactive object whose `online` value drives the "You are offline" banner.
- `notifications`: local notifications on the device. `schedule({ title, at, url })` sets up a reminder at a given time. I'm guessing that tapping the notification opens `url` and that it may ask for notification permission first.
- `settings`: opens this app's page in the operating system's Settings so the person can change permissions.
- `share`: the phone's native share sheet. `share.open({ title, url })` shows it with the article's title and link.

2:
- "Text size": switches the stored value between `'normal'` and `'large'`, which changes the `<article>` class. The setting persists on this device, so other Article components and later visits on the same device use it too. Other users don't see it.
- "Save for later": adds `id` to the shared reading list. Every component in the app that uses `readingList()` sees the change right away. It is only in memory, with no `storage`, so it is probably lost on reload, and other people or devices don't see it. It also doesn't check for duplicates.
- "Share": opens the phone's share sheet with the title and URL. Whoever the person picks (a contact, an app) receives the link. Nothing changes on the page.
- "Remind me in an hour": schedules a local notification titled "Read <title>" for one hour from now, linked to the URL. Only this person, on this device, sees it later. Whether it asks for permission first is a guess.
- "Turn on location in Settings": only shown when location access is denied. It opens the app's page in the system Settings. If the person allows location there, I'm guessing that `here.access` and `here.position` update and the "Reading near …" line appears. Only this person sees that.

3: Yes. `location` looks like the browser's `window.location`, which is the page URL. That briefly made me think this was about navigation, but `location()` with `.access` and `.position` reads as geolocation. `network` looks like `navigator.onLine` or the Network Information API. `notifications` looks like the browser's `Notification` API, but `.schedule` reads like Capacitor or Expo local notifications. `share` looks like `navigator.share`. `settings` is unclear from the name alone; it could be app preferences, but next to the "denied" check it reads as system Settings. `storage` looks like localStorage or the Storage API, and I'm not sure where it actually stores data. `shared` and the `{ ...box }` spread made me a little unsure whether the reading list stays reactive. None of this changed my overall reading, but `location` was the closest call.

Tools used: none
