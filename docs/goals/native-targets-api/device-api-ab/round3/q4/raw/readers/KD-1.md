1:
shared: A Markless helper that creates one instance that everything can use, like an app-wide store. `readingList()` gives every caller the same `{ ids }` box. Guess: it is shared within this app session on this device, not across users. I am also unsure whether spreading `box` with `{ ...box }` keeps the `ids` property reactive; I assume Markless makes that work.
state: Markless reactive state. `box.ids` is a reactive array of saved article ids, so assigning a new value to it updates the page.
storage: Reactive state that is saved under the key `'text-size'`, with `'normal'` as the default. Assigning to `textSize` both re-renders the page and saves the value. Guess: it lasts across reloads and app restarts on this device, perhaps through localStorage or a cookie.
location: A device feature that returns a reactive object for the phone's geolocation. It has `access`, which is a permission state such as `'denied'`, and `position`, which has `latitude` and `longitude` and is empty until a fix arrives. Guess: calling it asks for permission and starts watching the position.
network: A device feature that returns reactive connectivity status. Here `net.online` shows the "You are offline" banner when the phone has no connection.
notifications: Device notifications. `schedule()` sets up a local notification on the phone for a later time. Guess: tapping the notification opens `url`, and the first call may ask for notification permission.
settings: Opens the phone's system settings page for this app, so the person can change a permission.
share: Opens the phone's built-in share sheet with the title and URL.

2:
Text size: Switches `textSize` between `'normal'` and `'large'`. The `<article>` class changes immediately and the choice is saved for future visits. Only this person on this device sees it, in every Article that reads the same key.
Save for later: Adds this article's `id` to the shared reading list. Any other component in the app that uses `readingList()` updates. Only this person sees it, because nothing is sent to a server. Guess: unlike text size, the list is not kept after a reload, because it is plain `state` and not `storage`.
Share: Opens the native share sheet with the title and URL. Whoever the person sends it to, through messages, email and so on, receives the link.
Remind me in an hour: Schedules a local notification titled "Read <title>" for one hour from now, probably after a permission prompt. Only this person sees it, on this phone. Guess: tapping it opens the article URL.
Turn on location in Settings: Shown only when location permission was denied. It leaves the app and opens the phone's Settings for this app. If the person turns location on and comes back, I guess `here.access` updates and the "Reading near …" coordinates appear. Only this person sees them.

3:
`location` looks very much like the browser's `window.location`, which is the page URL. That did make me hesitate for a moment, until `here.access` and `here.position` showed it is geolocation.
`network` looks like `navigator.onLine` and the Network Information API.
`notifications` looks like the web `Notification` API, but `schedule()` is not a web feature; it looks more like a native local-notifications plugin.
`share.open` looks like `navigator.share`.
`storage` looks like `localStorage`/`sessionStorage` and the Web Storage API. It left me unsure where the value is actually stored and whether it is per device.
`shared` sounds a little like SharedWorker or SharedArrayBuffer, but its use here reads like a global store.
`state` looks like React `useState` or Svelte `$state`.
`settings` is generic and could be read as the app's own settings screen, but here it reads as the operating system's Settings.
Only `location` really made me pause.

Tools used: none
