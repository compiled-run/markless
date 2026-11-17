1:
- `shared` (Markless core): wraps a factory so every caller gets the same instance. `readingList()` returns one reading list that is shared across all `Article` components, and I'm guessing across the whole app session.
- `state` (Markless core): reactive state. Here it holds `{ ids: [] }`, so assigning `list.ids` updates the page. I'm guessing that spreading `...box` keeps the reactivity, so `list.ids = ...` still writes through to the state.
- `storage` (Markless core): a persisted reactive value under the key `'text-size'`, defaulting to `'normal'`. Assigning `textSize` both saves it and re-renders. It's used as the `<article>` class. I'm guessing the backing store is local to this device or browser, such as localStorage or a cookie.
- `location` (`@markless/device`): a reactive handle to the device's geolocation. It exposes `access`, a permission state such as `'denied'`, and `position` (latitude and longitude, null until known). Calling it probably asks for permission and starts reading the position. That part is a guess.
- `network` (`@markless/device`): a reactive handle to connectivity. `net.online` drives the "You are offline" banner.
- `notifications` (`@markless/device`): schedules local notifications on the device. `schedule({ title, at, url })` queues a reminder, and tapping it probably opens `url`, which is a guess. It might also ask for notification permission first. That's a guess too.
- `settings` (`@markless/device`): the OS settings app. `settings.open()` jumps to this app's settings page so the person can grant location access. Whether it opens the app-specific page or general settings is a guess.
- `sharesheet` (`@markless/device`): the native share sheet. `open({ title, url })` shows the OS share UI for this article.

2:
- Text size: switches `textSize` between `'normal'` and `'large'`, which changes the article's class and so its styling. The value is persisted, so it survives reloads, and every component using the `'text-size'` key sees it. Only this person on this device sees it. It isn't synced to other users; that's a guess, since nothing shows a server.
- Save for later: appends this article's `id` to the shared reading list. Every component in the app that reads `readingList()` sees the new entry at once. No other person sees it. It isn't persisted either, because it's plain `state` and not `storage`, so it's probably lost on reload. That's a guess. Pressing it twice adds a duplicate id.
- Share: opens the phone's native share sheet with the title and url. Whoever the person picks to send it to (a contact, an app) sees the link.
- Remind me in an hour: schedules a local notification titled "Read <title>" for one hour from now, linked to `url`. Only this person sees it, on this device. It may first ask for notification permission, which is a guess.
- Turn on location in Settings: this button only appears when location access was denied. It opens the OS Settings so the person can allow location. After that, `here.position` would fill in, and the "Reading near …" line would show the coordinates to this person only.

3: Yes, several names look like other things:
- `location` looks like the browser's `window.location` (the URL), which made me unsure for a moment. The `.access` and `.position` fields show it's geolocation, not the URL.
- `network` and `net.online` look like `navigator.onLine`.
- `notifications` looks like the Web `Notification` API, but `schedule` with an `at` time matches Capacitor's or React Native's LocalNotifications more than the web API.
- `sharesheet.open` looks like `navigator.share`.
- `settings` is a generic word and could have meant app preferences instead of the OS Settings app. The button label made it clear.
- `storage` looks like `localStorage` or Web Storage, and `shared` looks like a singleton or global store.

Only `location` and `settings` made me briefly unsure, and the surrounding code settled both.

Tools used: none
