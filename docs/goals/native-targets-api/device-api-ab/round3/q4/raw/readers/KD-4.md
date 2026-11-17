1:
- `shared` (Markless core): wraps a factory so every caller gets the same instance. Here `readingList()` hands each Article the same reading list object, `{ ids: [] }`, so all articles in the app use one list. I'm guessing it is shared within this one app session on this device, not with other users.
- `state` (Markless core): makes a reactive value. The `{ ids }` box redraws the page when `ids` is reassigned. Spreading it into a new object (`{ ...box }`) and still having it react is a guess. I'm assuming the spread keeps the reactive getters and setters.
- `storage` (Markless core): a reactive value that persists under a key, here `'text-size'` with the default `'normal'`. Assigning to `textSize` saves it and updates the `class`. My guess is it is stored on this device and survives a reload, maybe in localStorage or a cookie.
- `location` (device): a reactive handle on the phone's GPS. It exposes `access` (permission state, for example `'denied'`) and `position` (latitude and longitude, empty until known). I'm guessing that calling it starts the permission request and location watching.
- `network` (device): a reactive handle on connectivity. `net.online` drives the "You are offline" banner.
- `notifications` (device): local notifications. `schedule({ title, at, url })` queues a notification for a set time, and tapping it probably opens `url`.
- `settings` (device): the OS settings app. `open()` jumps to this app's settings page, presumably so the user can grant location.
- `share` (device): the OS share sheet. `open({ title, url })` shows the native share menu with the article's title and link.

2:
- Text size: toggles `textSize` between `'normal'` and `'large'`. The `<article>` class changes at once and the choice is saved, so it should still apply on reload and on other articles. Only this person on this device sees it. Whether a server-rendered page also sees it depends on how storage works, which I'm guessing.
- Save for later: appends this article's id to the shared reading list. Any other component on this device that reads `readingList()` updates. It isn't persisted (it's plain `state`, not `storage`), so I guess it's lost on reload, and other users don't see it. Pressing it again adds the id again, because nothing checks for duplicates.
- Share: opens the phone's native share sheet with the title and URL. Nothing happens in the app until the person picks a target. Then whoever they send it to (a contact, another app) gets the link.
- Remind me in an hour: schedules a local notification titled "Read <title>" for one hour from now. It probably asks for notification permission first (a guess). In an hour the person's own phone shows it, and tapping it likely opens `url`. No one else sees it.
- Turn on location in Settings: only shown when location access is denied. It opens the OS Settings app for this app. If the person grants access and comes back, I guess `here.access` updates and the "Reading near lat, long" line appears instead. Only the person sees it.

3: Several names look like things I already know. `location` looks like the browser's `window.location` (the page URL); seeing `location()` called as a function and then `.position`/`.access` read on it shows it's geolocation, but at first glance it made me unsure. `network` is close to `navigator.onLine` / the Network Information API, and `share.open` is close to `navigator.share`. `notifications` is close to the browser's `Notification` API, but `schedule` with `at` is more like Capacitor or Expo local notifications. `settings.open()` resembles Capacitor's open-app-settings helpers. `storage` evokes `localStorage`, which left me unsure whether it is device-local or synced somewhere else, such as a cookie the server can read. `shared` could be read as shared between users, but the code suggests one in-memory instance shared across components. Only `location` and `storage` caused real doubt.

Tools used: none
