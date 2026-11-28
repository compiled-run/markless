1:
- `shared` (from Markless): wraps a factory so every component that calls `readingList()` gets the same single instance. Here it creates one reading list for the whole app.
- `state` (from Markless): a reactive value. Assigning to it updates the page. Here it holds `{ ids: [] }`. I'm unsure about one thing: `return { ...box }` spreads the state into a plain object. If that copy loses reactivity, `list.ids = ...` would update only the copy. I'm guessing the framework handles this pattern, but the code doesn't show it.
- `storage` (from Markless): a persisted value, read and written like a variable, with key `'text-size'` and default `'normal'`. It survives reloads and later visits. I'm guessing it lives in local storage or a cookie.
- `location` (device): a reactive handle on the phone's GPS position, not the page URL. It exposes `access` (for example `'denied'`) and `position` (latitude and longitude). It probably asks for permission when first used; that is a guess.
- `network` (device): reactive connection status. Here `net.online` shows the "You are offline" banner.
- `notifications` (device): schedules a local notification on the phone. Here it creates a reminder one hour from now that probably opens `url` when tapped.
- `settings` (device): opens the phone's system Settings screen for this app.
- `sharesheet` (device): opens the phone's native share sheet with the article's title and link.

2:
- "Text size": switches between `'normal'` and `'large'`, which changes the article's class. The choice is saved, so this person keeps it on later visits and in other Article views. Nobody else sees it, although the server might read it if storage is a cookie; that is a guess.
- "Save for later": adds this article's id to the shared reading list. Every component on this device that calls `readingList()` sees the change right away. As far as the code shows, it is not saved to disk or sent to other users, and it can add the same id twice.
- "Share": opens the system share sheet. Whoever the person picks in another app (messages, mail and so on) receives the title and link.
- "Remind me in an hour": schedules a notification, "Read <title>", for one hour from now. Only this person sees it, on their phone. It may first ask for notification permission (guess), and tapping it probably opens `url` (guess).
- "Turn on location in Settings": appears only when location access was denied. It takes the person to the OS Settings app so they can allow location. When they come back, `here.position` may fill in and show "Reading near lat, long". Only this person sees that.

3: Yes, several names look familiar. `location` looks like the browser's `window.location` (the page URL), which made me briefly unsure until `here.position` and `here.access` showed it means GPS. `network().online` looks like `navigator.onLine`. `notifications` looks like the web `Notification` API, `sharesheet.open` looks like `navigator.share`, and `storage` looks like `localStorage`. `state` looks like React `useState` or signals, and `shared` looks like a singleton or context. `settings` is generic, but the button label makes its meaning clear. Only `location` and the `{ ...box }` spread made me unsure about what actually happens.

Tools used: none (apart from the one required Read of the instructions file)
